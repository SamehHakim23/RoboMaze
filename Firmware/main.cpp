#include <Arduino.h>
#include <WiFi.h>
#include <WiFiServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define STBY_PIN  33
#define LEFT_PWM  25
#define LEFT_IN1  26
#define LEFT_IN2  27
#define RIGHT_PWM 18
#define RIGHT_IN1 19
#define RIGHT_IN2 21
#define S1 14
#define S2 32
#define S3 5
#define S4 13
#define S5 4

#define ENC_LEFT_A  16
#define ENC_RIGHT_A 22

#define PWM_FREQ 1000
#define PWM_RES  8
#define LEFT_CH  0
#define RIGHT_CH 1

#define BLE_SERVICE_UUID  "12345678-1234-1234-1234-123456789abc"
#define BLE_TX_CHAR_UUID  "12345678-1234-1234-1234-123456789abd"
#define BLE_RX_CHAR_UUID  "12345678-1234-1234-1234-123456789abe"
#define BLE_DEVICE_NAME   "RoboMaze"

const char* WIFI_SSID = "Samehs iphone";
const char* WIFI_PASS = "Sameh1234";
IPAddress staticIP(172, 20, 10, 9);
IPAddress gateway(172, 20, 10, 1);
IPAddress subnet(255, 255, 255, 240);
IPAddress dns(8, 8, 8, 8);

WiFiServer       telnetServer(23);
WiFiClient       telnetClient;
WebSocketsServer wsServer(81);

BLEServer*         pBLEServer      = nullptr;
BLECharacteristic* pTxChar         = nullptr;
BLECharacteristic* pRxChar         = nullptr;
bool               bleConnected    = false;
bool               bleWasConnected = false;
bool               wifiConnected   = false;

volatile long encLeftCount=0, encRightCount=0;
void IRAM_ATTR isrLeftA()  { encLeftCount++;  }
void IRAM_ATTR isrRightA() { encRightCount++; }
void resetEncoders() { encLeftCount=0; encRightCount=0; }
long getAvgTicks()   { return (encLeftCount+encRightCount)/2; }

long refTicks=0; bool refCalibrated=false;
void resetCalibration() { refTicks=0; refCalibrated=false; }
#define REL_LEN_MIN 0.3f
float computeRelLen(long ticks) {
  if(ticks<=0) return REL_LEN_MIN;
  if(!refCalibrated){ refTicks=ticks; refCalibrated=true; return 1.0f; }
  if(refTicks<=0) return REL_LEN_MIN;
  float r=(float)ticks/(float)refTicks;
  return r<REL_LEN_MIN?REL_LEN_MIN:r;
}

int BASE_SPEED=170, MIN_SPEED=90, MAX_SPEED=255, TURN_SPEED=130;
int CORR_TIER1=50, CORR_TIER2=55, CORR_TIER3=60, CORR_TIER4=65;
unsigned long SETTLE_TIME=300, JUNCTION_CREEP_TIME=275, GOAL_CREEP_TIME=150;
unsigned long SMART_UTURN_CREEP_TIME=25, PEEK_CREEP_TIME=150;
unsigned long FORCED_TURN_TIME=310, SEARCH_TIMEOUT=1700;
const unsigned long MANUAL_TURN_90=780, MANUAL_TURN_180=1560;
const unsigned long STOP_PAUSE=35, REACQUIRE_CONFIRM_MS=45;
const unsigned long LINE_LOST_TIMEOUT_MS=220, EVENT_LOCKOUT_MS=220;
const unsigned long TELEMETRY_INTERVAL_MS=100;

int  lastError=0;
unsigned long eventLockoutUntil=0, lastTelemetryMs=0;
int  currentPWML=0, currentPWMR=0;
bool gS1=false,gS2=false,gS3=false,gS4=false,gS5=false;
bool robotPaused=false;

enum RobotState {
  STATE_IDLE, STATE_LHR, STATE_WAITING_BACK,
  STATE_RETURNING, STATE_WAITING_RUN2, STATE_RUN2,
  STATE_WAITING_BACK2, STATE_BACK2, STATE_MANUAL
};
RobotState robotState=STATE_IDLE;

int currentHeading=0, currentX=0, currentY=0;
const int dX[4]={0,1,0,-1}, dY[4]={1,0,-1,0};
#define MAX_JUNCTIONS 60

struct JunctionRecord {
  int id,x,y,headingOnArrival;
  bool hasL,hasS,hasR; char decision; long ticks; float relLen;
};
JunctionRecord jLog[MAX_JUNCTIONS];
int jCount=0, goalX=0, goalY=0;

char returnPath[MAX_JUNCTIONS*2+1]; int returnPathLen=0, returnPathIdx=0;
char run2Decisions[MAX_JUNCTIONS];  int run2Count=0;
char back2Path[MAX_JUNCTIONS*2+1];  int back2PathLen=0, back2PathIdx=0;

String lhrSimplifiedStr="", run2SimplifiedStr="", wsCommandBuffer="";

void tlog(const char* fmt, ...);
const char* hName(int h); const char* hShort(int h);
void stopMotors(); void broadcastTelemetry();
void broadcastAll(String msg); void broadcastEvent(const char* et, const char* msg);

#define MAX_BAD 60
struct BadMove { int x,y,absDir; };
BadMove run2Bad[MAX_BAD];
int run2BadCount=0, run2LastJX=0, run2LastJY=0, run2LastAbsDir=0;
bool run2JustBacktracked=false;

void resetRun2Backtracking() {
  run2BadCount=0; run2LastJX=run2LastJY=run2LastAbsDir=0;
  run2JustBacktracked=false;
}
bool isMoveBad(int x,int y,int absDir) {
  for(int i=0;i<run2BadCount;i++)
    if(run2Bad[i].x==x&&run2Bad[i].y==y&&run2Bad[i].absDir==absDir) return true;
  return false;
}
void markLastMoveBad() {
  if(run2BadCount>=MAX_BAD) return;
  if(isMoveBad(run2LastJX,run2LastJY,run2LastAbsDir)) return;
  run2Bad[run2BadCount++]={run2LastJX,run2LastJY,run2LastAbsDir};
  tlog("[BAD] (%d,%d) dir=%s\n",run2LastJX,run2LastJY,hShort(run2LastAbsDir));
}

class RoboServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*)    override { bleConnected=true; }
  void onDisconnect(BLEServer*) override { bleConnected=false; bleWasConnected=true; }
};

void applyConfig(StaticJsonDocument<256>& doc) {
  if(doc.containsKey("baseSpeed"))     BASE_SPEED         =doc["baseSpeed"];
  if(doc.containsKey("turnSpeed"))     TURN_SPEED         =doc["turnSpeed"];
  if(doc.containsKey("minSpeed"))      MIN_SPEED          =doc["minSpeed"];
  if(doc.containsKey("settleTime"))    SETTLE_TIME        =doc["settleTime"];
  if(doc.containsKey("junctionCreep")) JUNCTION_CREEP_TIME=doc["junctionCreep"];
  if(doc.containsKey("forcedTurn"))    FORCED_TURN_TIME   =doc["forcedTurn"];
  if(doc.containsKey("searchTimeout")) SEARCH_TIMEOUT     =doc["searchTimeout"];
  if(doc.containsKey("corrT1"))        CORR_TIER1         =doc["corrT1"];
  if(doc.containsKey("corrT2"))        CORR_TIER2         =doc["corrT2"];
  if(doc.containsKey("corrT3"))        CORR_TIER3         =doc["corrT3"];
  if(doc.containsKey("corrT4"))        CORR_TIER4         =doc["corrT4"];
  tlog("[CONFIG] BASE=%d TURN=%d\n",BASE_SPEED,TURN_SPEED);
  broadcastEvent("CONFIG_UPDATED","Parameters updated");
}

class BLERxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    String val=pChar->getValue().c_str(); val.trim();
    if(!val.length()) return;
    StaticJsonDocument<256> doc;
    if(deserializeJson(doc,val)==DeserializationError::Ok) {
      const char* cmd=doc["cmd"];
      if(cmd){
        if(String(cmd)=="config"){ applyConfig(doc); return; }
        wsCommandBuffer=String(cmd); wsCommandBuffer.trim(); wsCommandBuffer.toLowerCase();
      }
    }
  }
};

// ==================================================
// BROADCAST
// WiFi: everything
// BLE:  everything EXCEPT logs and config_state
//       logs = noise, config_state = too large
//       telemetry passes through so sensors work
// ==================================================
void broadcastAll(String msg) {
  if(wifiConnected) wsServer.broadcastTXT(msg);
  if(bleConnected && pTxChar) {
    bool isLog        = msg.indexOf("\"type\":\"log\"")==-1         ? false : true;
    bool isConfigState= msg.indexOf("\"type\":\"config_state\"")==-1 ? false : true;
    if(!isLog && !isConfigState && msg.length()<=500){
      pTxChar->setValue(msg.c_str());
      pTxChar->notify();
      delay(20);
    }
  }
}

void bleNotify(String msg) {
  if(!bleConnected || !pTxChar) return;
  if(msg.length()>500) msg=msg.substring(0,497)+"...";
  pTxChar->setValue(msg.c_str());
  pTxChar->notify();
  delay(30);
}

void onWebSocketEvent(uint8_t clientNum,WStype_t type,uint8_t* payload,size_t length) {
  if(type==WStype_CONNECTED) {
    Serial.printf("[WS] Client #%d connected\n",clientNum);
    wsServer.sendTXT(clientNum,"{\"type\":\"connected\",\"version\":\"3.0\"}");
    StaticJsonDocument<256> cfg;
    cfg["type"]="config_state"; cfg["baseSpeed"]=BASE_SPEED; cfg["turnSpeed"]=TURN_SPEED;
    cfg["minSpeed"]=MIN_SPEED; cfg["settleTime"]=SETTLE_TIME;
    cfg["junctionCreep"]=JUNCTION_CREEP_TIME; cfg["forcedTurn"]=FORCED_TURN_TIME;
    cfg["searchTimeout"]=SEARCH_TIMEOUT; cfg["corrT1"]=CORR_TIER1;
    cfg["corrT2"]=CORR_TIER2; cfg["corrT3"]=CORR_TIER3; cfg["corrT4"]=CORR_TIER4;
    String cfgOut; serializeJson(cfg,cfgOut); wsServer.sendTXT(clientNum,cfgOut);
  }
  else if(type==WStype_DISCONNECTED) {
    Serial.printf("[WS] Client #%d disconnected\n",clientNum);
  }
  else if(type==WStype_TEXT) {
    StaticJsonDocument<256> doc;
    if(deserializeJson(doc,payload,length)!=DeserializationError::Ok) return;
    const char* cmd=doc["cmd"];
    if(!cmd) return;
    Serial.printf("[WS] Cmd: %s\n",cmd);
    if(String(cmd)=="config"){ applyConfig(doc); return; }
    wsCommandBuffer=String(cmd); wsCommandBuffer.trim(); wsCommandBuffer.toLowerCase();
  }
}

const char* stateStr() {
  switch(robotState){
    case STATE_IDLE:          return "IDLE";
    case STATE_LHR:           return "LHR";
    case STATE_WAITING_BACK:  return "WAITING_BACK";
    case STATE_RETURNING:     return "RETURNING";
    case STATE_WAITING_RUN2:  return "WAITING_RUN2";
    case STATE_RUN2:          return "RUN2";
    case STATE_WAITING_BACK2: return "WAITING_BACK2";
    case STATE_BACK2:         return "BACK2";
    case STATE_MANUAL:        return "MANUAL";
    default:                  return "UNKNOWN";
  }
}

// Telemetry at 100ms — passes through BLE so sensors display works
void broadcastTelemetry() {
  if(millis()-lastTelemetryMs<TELEMETRY_INTERVAL_MS) return;
  lastTelemetryMs=millis();
  StaticJsonDocument<256> doc;
  doc["type"]="telemetry"; doc["state"]=stateStr(); doc["paused"]=robotPaused;
  doc["x"]=currentX; doc["y"]=currentY; doc["heading"]=hShort(currentHeading);
  doc["pwmL"]=currentPWML; doc["pwmR"]=currentPWMR;
  doc["goalX"]=goalX; doc["goalY"]=goalY;
  JsonArray s=doc.createNestedArray("sensors");
  s.add(gS1?1:0);s.add(gS2?1:0);s.add(gS3?1:0);s.add(gS4?1:0);s.add(gS5?1:0);
  String out; serializeJson(doc,out); broadcastAll(out);
}

void broadcastEvent(const char* et,const char* msg) {
  StaticJsonDocument<200> doc;
  doc["type"]="event"; doc["event"]=et; doc["message"]=msg;
  doc["x"]=currentX; doc["y"]=currentY; doc["heading"]=hShort(currentHeading);
  String out; serializeJson(doc,out); broadcastAll(out);
}

void broadcastJunction(bool hasL,bool hasS,bool hasR,char decision,long ticks,float relLen) {
  StaticJsonDocument<192> doc;
  doc["type"]="junction"; doc["id"]=jCount;
  doc["x"]=currentX; doc["y"]=currentY; doc["heading"]=hShort(currentHeading);
  doc["hasL"]=hasL; doc["hasS"]=hasS; doc["hasR"]=hasR;
  doc["decision"]=String(decision); doc["ticks"]=ticks;
  doc["relLen"]=(float)((int)(relLen*100+0.5f))/100.0f;
  String out; serializeJson(doc,out); broadcastAll(out);
}

void broadcastGoalNode() {
  StaticJsonDocument<100> doc;
  doc["type"]="goal_node"; doc["x"]=goalX; doc["y"]=goalY;
  doc["heading"]=hShort(currentHeading);
  String out; serializeJson(doc,out); broadcastAll(out);
}

void broadcastPath(const char* pathType,const char* pathStr) {
  StaticJsonDocument<256> doc;
  doc["type"]="path"; doc["path"]=pathType; doc["data"]=pathStr;
  String out; serializeJson(doc,out); broadcastAll(out);
}

void handleTelnet() {
  if(!wifiConnected) return;
  if(!telnetClient||!telnetClient.connected()){
    telnetClient=telnetServer.available();
    if(telnetClient){ Serial.println("[TELNET] Connected"); telnetClient.println("=== MAZE ROBOT v3.0 ==="); }
  }
}

// tlog goes to Serial + Telnet + WiFi only — never BLE (noise)
void tlog(const char* fmt,...) {
  char buf[256];
  va_list a; va_start(a,fmt); vsnprintf(buf,sizeof(buf),fmt,a); va_end(a);
  Serial.print(buf);
  if(wifiConnected&&telnetClient&&telnetClient.connected()) telnetClient.print(buf);
  if(wifiConnected){
    StaticJsonDocument<300> doc;
    doc["type"]="log"; doc["msg"]=buf;
    String out; serializeJson(doc,out); wsServer.broadcastTXT(out);
  }
}

void sep()    { tlog("---\n"); }
void bigSep() { tlog("===================================\n"); }

const char* hName(int h) { const char* n[]={"N(+Y)","E(+X)","S(-Y)","W(-X)"}; return (h>=0&&h<4)?n[h]:"?"; }
const char* hShort(int h){ const char* n[]={"N","E","S","W"}; return (h>=0&&h<4)?n[h]:"?"; }
void updateHeading(char dir) {
  if(dir=='L') currentHeading=(currentHeading+3)%4;
  else if(dir=='R') currentHeading=(currentHeading+1)%4;
  else if(dir=='B') currentHeading=(currentHeading+2)%4;
}

void recordJunction(bool hasL,bool hasS,bool hasR,char dec,long corridorTicks=0) {
  float relLen=computeRelLen(corridorTicks);
  currentX+=dX[currentHeading]; currentY+=dY[currentHeading];
  if(jCount<MAX_JUNCTIONS){
    jLog[jCount]={jCount,currentX,currentY,currentHeading,hasL,hasS,hasR,dec,corridorTicks,relLen};
    jCount++;
  }
  broadcastJunction(hasL,hasS,hasR,dec,corridorTicks,relLen);
  tlog("[JCT #%02d] (%d,%d) %s L=%d S=%d R=%d ->%c ticks=%ld rel=%.2f\n",
       jCount-1,currentX,currentY,hName(currentHeading),hasL,hasS,hasR,dec,corridorTicks,relLen);
}

void printLHRMap() {
  tlog("\n"); bigSep(); tlog("  LHR MAP\n"); bigSep();
  for(int i=0;i<jCount;i++){
    JunctionRecord& j=jLog[i];
    tlog("  J%02d (%d,%d) %s [L=%d S=%d R=%d] ->%c ticks=%ld rel=%.2f\n",
         j.id,j.x,j.y,hShort(j.headingOnArrival),j.hasL,j.hasS,j.hasR,j.decision,j.ticks,j.relLen);
  }
  bigSep();
  String raw=""; for(int i=0;i<jCount;i++) raw+=jLog[i].decision;
  broadcastPath("lhr_raw",raw.c_str());
  broadcastEvent("GOAL_REACHED","LHR complete");
}

void printRun2Map() {
  tlog("\n"); bigSep(); tlog("  RUN2 RESULT\n"); bigSep();
  tlog("  Goal: (%d,%d)  Arrived: (%d,%d)\n",goalX,goalY,currentX,currentY);
  String r=""; for(int i=0;i<run2Count;i++) r+=run2Decisions[i];
  tlog("  Run2: %s\n",r.c_str()); bigSep();
  broadcastPath("run2_raw",r.c_str());
  broadcastEvent("RUN2_GOAL","Run2 complete");
}

void printFullSummary() {
  String lhrRaw=""; for(int i=0;i<jCount;i++) lhrRaw+=jLog[i].decision;
  String run2Raw=""; for(int i=0;i<run2Count;i++) run2Raw+=run2Decisions[i];
  String back2Str=""; for(int i=0;i<back2PathLen;i++) back2Str+=back2Path[i];
  String backStr=""; for(int i=0;i<returnPathLen;i++) backStr+=returnPath[i];
  tlog("\n"); bigSep(); tlog("  FULL SUMMARY\n"); bigSep();
  tlog("  1. LHR   (%d): %s\n",lhrRaw.length(),lhrRaw.c_str());
  tlog("     Simp  (%d): %s\n",lhrSimplifiedStr.length(),lhrSimplifiedStr.c_str());
  tlog("  2. Back  (%d): %s\n",backStr.length(),backStr.c_str());
  tlog("  3. Run2  (%d): %s\n",run2Raw.length(),run2Raw.c_str());
  tlog("     Simp  (%d): %s\n",run2SimplifiedStr.length(),run2SimplifiedStr.c_str());
  tlog("  4. Back2 (%d): %s\n",back2Str.length(),back2Str.c_str());
  bigSep();

  // WiFi: full summary JSON
  if(wifiConnected){
    StaticJsonDocument<512> doc;
    doc["type"]="summary"; doc["goalX"]=goalX; doc["goalY"]=goalY;
    doc["lhr_raw"]=lhrRaw; doc["lhr_simplified"]=lhrSimplifiedStr; doc["back"]=backStr;
    doc["run2_raw"]=run2Raw; doc["run2_simplified"]=run2SimplifiedStr; doc["back2"]=back2Str;
    String out; serializeJson(doc,out); wsServer.broadcastTXT(out);
  }

  // BLE: individual path strings — short and clean
  if(bleConnected && pTxChar){
    bleNotify("{\"type\":\"ble_summary\",\"goalX\":"+String(goalX)+",\"goalY\":"+String(goalY)+"}");
    bleNotify("{\"type\":\"path\",\"path\":\"lhr_raw\",\"data\":\""+lhrRaw+"\"}");
    bleNotify("{\"type\":\"path\",\"path\":\"lhr_simplified\",\"data\":\""+lhrSimplifiedStr+"\"}");
    bleNotify("{\"type\":\"path\",\"path\":\"back\",\"data\":\""+backStr+"\"}");
    bleNotify("{\"type\":\"path\",\"path\":\"run2_raw\",\"data\":\""+run2Raw+"\"}");
    bleNotify("{\"type\":\"path\",\"path\":\"run2_simplified\",\"data\":\""+run2SimplifiedStr+"\"}");
    bleNotify("{\"type\":\"path\",\"path\":\"back2\",\"data\":\""+back2Str+"\"}");
  }
}

void leftForward()   {digitalWrite(LEFT_IN1,LOW); digitalWrite(LEFT_IN2,HIGH);}
void leftBackward()  {digitalWrite(LEFT_IN1,HIGH);digitalWrite(LEFT_IN2,LOW); }
void rightForward()  {digitalWrite(RIGHT_IN1,HIGH);digitalWrite(RIGHT_IN2,LOW);}
void rightBackward() {digitalWrite(RIGHT_IN1,LOW);digitalWrite(RIGHT_IN2,HIGH);}
void bothForward()  {leftForward();  rightForward();}
void bothBackward() {leftBackward(); rightBackward();}
void rotateLeft()   {leftBackward(); rightForward();}
void rotateRight()  {leftForward();  rightBackward();}

void stopMotors() {
  ledcWrite(LEFT_CH,0); ledcWrite(RIGHT_CH,0); currentPWML=0; currentPWMR=0;
}
void setPWM(int l,int r) {
  currentPWML=constrain(l,0,255); currentPWMR=constrain(r,0,255);
  ledcWrite(LEFT_CH,(uint8_t)currentPWML); ledcWrite(RIGHT_CH,(uint8_t)currentPWMR);
}

bool readBlackFiltered(int pin) {
  int c=0;
  for(int i=0;i<3;i++){if(digitalRead(pin)==LOW)c++;delayMicroseconds(150);}
  return c>=2;
}
void readSensors(bool &s1,bool &s2,bool &s3,bool &s4,bool &s5) {
  s1=readBlackFiltered(S1); s2=readBlackFiltered(S2); s3=readBlackFiltered(S3);
  s4=readBlackFiltered(S4); s5=readBlackFiltered(S5);
  gS1=s1; gS2=s2; gS3=s3; gS4=s4; gS5=s5;
}
void updateSensorGlobals() {
  gS1=readBlackFiltered(S1); gS2=readBlackFiltered(S2); gS3=readBlackFiltered(S3);
  gS4=readBlackFiltered(S4); gS5=readBlackFiltered(S5);
}
int countBlack(bool s1,bool s2,bool s3,bool s4,bool s5){
  return (s1?1:0)+(s2?1:0)+(s3?1:0)+(s4?1:0)+(s5?1:0);
}
String pat(bool s1,bool s2,bool s3,bool s4,bool s5){
  String p="";
  p+=s1?'1':'0';p+=s2?'1':'0';p+=s3?'1':'0';p+=s4?'1':'0';p+=s5?'1':'0';
  return p;
}
bool centerOnLine(){
  bool s1,s2,s3,s4,s5; readSensors(s1,s2,s3,s4,s5); return s3||(s2&&s4);
}

void delayWS(unsigned long ms) {
  unsigned long start=millis();
  while(millis()-start<ms){
    if(wifiConnected) wsServer.loop();
    broadcastTelemetry();
    if(bleWasConnected&&!bleConnected){ bleWasConnected=false; BLEDevice::startAdvertising(); }
    delay(10);
  }
}

bool waitForLine(unsigned long timeoutMs) {
  unsigned long start=millis();
  while(millis()-start<timeoutMs){
    if(wifiConnected) wsServer.loop(); broadcastTelemetry();
    if(centerOnLine()){
      unsigned long hold=millis();
      while(millis()-hold<REACQUIRE_CONFIRM_MS){if(!centerOnLine())hold=millis();}
      return true;
    }
  }
  return false;
}

bool doTurn(char dir) {
  if(dir=='S'){updateHeading('S');return true;}
  bool ok=false;
  if(dir=='L'){ rotateLeft();  setPWM(TURN_SPEED,TURN_SPEED); delayWS(FORCED_TURN_TIME); ok=waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE); tlog(ok?"[TURN] L OK\n":"[TURN] L FAIL\n"); updateHeading('L'); return ok; }
  if(dir=='R'){ rotateRight(); setPWM(TURN_SPEED,TURN_SPEED); delayWS(FORCED_TURN_TIME); ok=waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE); tlog(ok?"[TURN] R OK\n":"[TURN] R FAIL\n"); updateHeading('R'); return ok; }
  if(dir=='B'){ rotateLeft();  setPWM(TURN_SPEED,TURN_SPEED); delayWS(FORCED_TURN_TIME*2); ok=waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE); tlog(ok?"[TURN] U OK\n":"[TURN] U FAIL\n"); updateHeading('B'); return ok; }
  return false;
}

bool doSmartUTurn(bool hasL,bool hasS,bool hasR) {
  bothForward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(SMART_UTURN_CREEP_TIME); stopMotors(); delay(STOP_PAUSE);
  bool ok=false;
  if(hasL&&!hasS&&!hasR)      { rotateRight(); }
  else if(hasR&&!hasS&&!hasL) { rotateLeft();  }
  else if(hasL&&hasS&&!hasR)  { rotateRight(); }
  else if(hasR&&hasS&&!hasL)  { rotateLeft();  }
  else if(hasL&&hasR&&!hasS)  { bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(150); stopMotors(); delay(STOP_PAUSE); rotateLeft(); }
  else                         { rotateLeft();  }
  setPWM(TURN_SPEED,TURN_SPEED); delayWS(FORCED_TURN_TIME*2);
  ok=waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE);
  tlog(ok?"[SMART U] OK\n":"[SMART U] FAIL\n"); updateHeading('B'); return ok;
}

void creepForward() { bothForward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(JUNCTION_CREEP_TIME); stopMotors(); delay(STOP_PAUSE); }
void startEventLockout(){ eventLockoutUntil=millis()+EVENT_LOCKOUT_MS; }

void manualRotate90L()  { tlog("[MAN] 90L\n");  rotateLeft();  setPWM(TURN_SPEED,TURN_SPEED); delayWS(MANUAL_TURN_90);  stopMotors(); delay(STOP_PAUSE); updateHeading('L'); broadcastEvent("ROTATED","90L"); }
void manualRotate90R()  { tlog("[MAN] 90R\n");  rotateRight(); setPWM(TURN_SPEED,TURN_SPEED); delayWS(MANUAL_TURN_90);  stopMotors(); delay(STOP_PAUSE); updateHeading('R'); broadcastEvent("ROTATED","90R"); }
void manualRotate180()  { tlog("[MAN] 180\n");  rotateLeft();  setPWM(TURN_SPEED,TURN_SPEED); delayWS(MANUAL_TURN_180); stopMotors(); delay(STOP_PAUSE); updateHeading('B'); broadcastEvent("ROTATED","180"); }
void manualAdvanceCell(){ tlog("[MAN] Adv\n");  resetEncoders(); bothForward(); setPWM(BASE_SPEED,BASE_SPEED); bool f=waitForLine(2000); stopMotors(); delay(STOP_PAUSE); if(f){currentX+=dX[currentHeading];currentY+=dY[currentHeading];} broadcastEvent("ADVANCED","1 cell"); }
void manualReverseCell(){ tlog("[MAN] Rev\n");  bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(500); stopMotors(); delay(STOP_PAUSE); broadcastEvent("REVERSED","1 cell"); }

char reduceTriplet(char a,char c) {
  if(a=='L'&&c=='L') return 'S'; if(a=='L'&&c=='R') return 'B';
  if(a=='L'&&c=='S') return 'R'; if(a=='R'&&c=='L') return 'B';
  if(a=='R'&&c=='R') return 'S'; if(a=='R'&&c=='S') return 'L';
  if(a=='S'&&c=='L') return 'R'; if(a=='S'&&c=='R') return 'L';
  if(a=='S'&&c=='S') return 'B'; return 'B';
}

String reducePathString(String path) {
  bool changed=true;
  while(changed){
    changed=false;
    while(path.length()>0&&path[0]=='B'){path=path.substring(1);changed=true;}
    while(path.length()>0&&path[path.length()-1]=='B'){path=path.substring(0,path.length()-1);changed=true;}
    for(int i=0;i<(int)path.length()-1;i++){
      if(path[i]=='B'&&path[i+1]=='B'){path=path.substring(0,i)+path.substring(i+2);changed=true;break;}
    }
    for(int i=1;i<(int)path.length()-1;i++){
      if(path[i]=='B'){
        char r=reduceTriplet(path[i-1],path[i+1]);
        path=path.substring(0,i-1)+r+path.substring(i+2);
        changed=true; break;
      }
    }
  }
  return path;
}

void buildReturnPath() {
  String raw=""; for(int i=0;i<jCount;i++) raw+=jLog[i].decision;
  tlog("[PATH] Raw  (%d): %s\n",raw.length(),raw.c_str());
  lhrSimplifiedStr=reducePathString(raw);
  tlog("[PATH] Simp (%d): %s\n",lhrSimplifiedStr.length(),lhrSimplifiedStr.c_str());
  returnPathLen=0;
  for(int i=(int)lhrSimplifiedStr.length()-1;i>=0;i--){
    char c=lhrSimplifiedStr[i];
    if(c=='L') returnPath[returnPathLen++]='R';
    else if(c=='R') returnPath[returnPathLen++]='L';
    else if(c=='S') returnPath[returnPathLen++]='S';
  }
  returnPath[returnPathLen]=0;
  tlog("[PATH] Back (%d): ",returnPathLen);
  for(int i=0;i<returnPathLen;i++) tlog("%c",returnPath[i]); tlog("\n");
  broadcastPath("lhr_simplified",lhrSimplifiedStr.c_str());
  broadcastPath("back",returnPath);
}

void buildBack2Path() {
  String raw=""; for(int i=0;i<run2Count;i++) raw+=run2Decisions[i];
  tlog("[BACK2] Raw  (%d): %s\n",raw.length(),raw.c_str());
  run2SimplifiedStr=reducePathString(raw);
  tlog("[BACK2] Simp (%d): %s\n",run2SimplifiedStr.length(),run2SimplifiedStr.c_str());
  back2PathLen=0;
  for(int i=(int)run2SimplifiedStr.length()-1;i>=0;i--){
    char c=run2SimplifiedStr[i];
    if(c=='L') back2Path[back2PathLen++]='R';
    else if(c=='R') back2Path[back2PathLen++]='L';
    else if(c=='S') back2Path[back2PathLen++]='S';
  }
  back2Path[back2PathLen]=0;
  tlog("[BACK2] Back (%d): ",back2PathLen);
  for(int i=0;i<back2PathLen;i++) tlog("%c",back2Path[i]); tlog("\n");
  broadcastPath("run2_simplified",run2SimplifiedStr.c_str());
  broadcastPath("back2",back2Path);
}

void processCommand(String cmdStr) {
  cmdStr.trim(); cmdStr.toLowerCase();
  if(cmdStr=="start"&&(robotState==STATE_IDLE||robotState==STATE_LHR)){
    jCount=0; goalX=0; goalY=0; currentX=0; currentY=0; currentHeading=0;
    resetEncoders(); resetCalibration(); robotState=STATE_LHR; startEventLockout();
    broadcastEvent("STARTED","LHR started"); tlog("GO!\n\n");
  }
  else if(cmdStr=="back"&&robotState==STATE_WAITING_BACK){
    tlog("\n"); bigSep(); tlog("  RETURNING\n"); bigSep(); buildReturnPath();
    bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(JUNCTION_CREEP_TIME); stopMotors(); delayWS(200);
    doTurn('B'); returnPathIdx=0; robotState=STATE_RETURNING; startEventLockout();
    broadcastEvent("RETURNING","Returning to start");
  }
  else if(cmdStr=="run2"&&robotState==STATE_WAITING_RUN2){
    tlog("\n"); bigSep(); tlog("  RUN2\n"); bigSep();
    currentX=0; currentY=0; currentHeading=0; run2Count=0; resetRun2Backtracking();
    resetEncoders(); resetCalibration(); robotState=STATE_RUN2; startEventLockout();
    broadcastEvent("RUN2_START","Run2 started");
  }
  else if(cmdStr=="back2"&&robotState==STATE_WAITING_BACK2){
    tlog("\n"); bigSep(); tlog("  BACK2\n"); bigSep(); buildBack2Path();
    bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(JUNCTION_CREEP_TIME); stopMotors(); delayWS(200);
    doTurn('B'); back2PathIdx=0; robotState=STATE_BACK2; startEventLockout();
    broadcastEvent("BACK2_START","Back2 started");
  }
  else if(cmdStr=="pause")  { robotPaused=true; stopMotors(); tlog("[PAUSE]\n"); broadcastEvent("PAUSED","Paused"); }
  else if(cmdStr=="resume") { robotPaused=false; startEventLockout(); tlog("[RESUME]\n"); broadcastEvent("RESUMED","Resumed"); }
  else if(cmdStr=="halt"||cmdStr=="estop") { robotPaused=true; stopMotors(); eventLockoutUntil=0; tlog("[ESTOP]\n"); broadcastEvent("ESTOP","E-Stop"); }
  else if(cmdStr=="reset"||cmdStr=="wipe"){
    stopMotors(); robotPaused=false; robotState=STATE_IDLE;
    jCount=0; goalX=0; goalY=0; currentX=0; currentY=0; currentHeading=0;
    returnPathLen=0; returnPathIdx=0; run2Count=0; back2PathLen=0; back2PathIdx=0;
    lhrSimplifiedStr=""; run2SimplifiedStr=""; resetRun2Backtracking();
    eventLockoutUntil=0; resetEncoders(); resetCalibration();
    tlog("[RESET]\n"); broadcastEvent("RESET","Wiped");
  }
  else if(cmdStr=="forward_start") { robotState=STATE_MANUAL; bothForward();  setPWM(BASE_SPEED,BASE_SPEED); }
  else if(cmdStr=="backward_start"){ robotState=STATE_MANUAL; bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); }
  else if(cmdStr=="left_start")    { robotState=STATE_MANUAL; rotateLeft();   setPWM(TURN_SPEED,TURN_SPEED); }
  else if(cmdStr=="right_start")   { robotState=STATE_MANUAL; rotateRight();  setPWM(TURN_SPEED,TURN_SPEED); }
  else if(cmdStr=="stop_motors")   { stopMotors(); if(robotState==STATE_MANUAL) robotState=STATE_IDLE; broadcastEvent("STOPPED","Motors stopped"); }
  else if(cmdStr=="rotate_l90")    { manualRotate90L(); }
  else if(cmdStr=="rotate_r90")    { manualRotate90R(); }
  else if(cmdStr=="rotate_180")    { manualRotate180(); }
  else if(cmdStr=="advance_cell")  { manualAdvanceCell(); }
  else if(cmdStr=="reverse_cell")  { manualReverseCell(); }
  else if(cmdStr=="forward")  { bothForward();  setPWM(BASE_SPEED,BASE_SPEED); delayWS(200); stopMotors(); }
  else if(cmdStr=="backward") { bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(200); stopMotors(); }
  else if(cmdStr=="left")     { rotateLeft();   setPWM(TURN_SPEED,TURN_SPEED); delayWS(100); stopMotors(); }
  else if(cmdStr=="right")    { rotateRight();  setPWM(TURN_SPEED,TURN_SPEED); delayWS(100); stopMotors(); }
}

void checkCommands() {
  String cmd="";
  if(Serial.available()) cmd=Serial.readStringUntil('\n');
  else if(wifiConnected&&telnetClient&&telnetClient.connected()&&telnetClient.available())
    cmd=telnetClient.readStringUntil('\n');
  else if(wsCommandBuffer.length()>0){ cmd=wsCommandBuffer; wsCommandBuffer=""; }
  if(!cmd.length()) return;
  cmd.trim(); cmd.toLowerCase();
  if(cmd=="resume"||cmd=="halt"||cmd=="estop"||cmd=="reset"||cmd=="wipe"||cmd=="stop_motors"){
    processCommand(cmd); return;
  }
  if(robotPaused){ tlog("[PAUSED] blocked: %s\n",cmd.c_str()); return; }
  processCommand(cmd);
}

void handleJunctionLHR(bool hasL,bool hasR,bool alreadyCreped=false) {
  tlog("\n"); sep(); tlog("[LHR JCT] L=%d R=%d\n",hasL,hasR);
  long ticksBeforeCreep=getAvgTicks();
  if(!alreadyCreped) creepForward();
  bool ps1,ps2,ps3,ps4,ps5; readSensors(ps1,ps2,ps3,ps4,ps5);
  tlog("[AFTER CREEP] %s\n",pat(ps1,ps2,ps3,ps4,ps5).c_str());
  hasL = hasL || ps1;
  bool hasS = ps2 || ps3 || ps4;
  hasR = hasR || ps5;
  tlog("[EXITS] L=%d S=%d R=%d\n",hasL,hasS,hasR);
  char dir; if(hasL) dir='L'; else if(hasS) dir='S'; else if(hasR) dir='R'; else dir='B';
  tlog("[DECISION] %c\n",dir);
  long corridorTicks=(dir=='S')?getAvgTicks():ticksBeforeCreep;
  recordJunction(hasL,hasS,hasR,dir,corridorTicks);
  doTurn(dir); resetEncoders(); startEventLockout(); sep();
}

void handleJunctionRun2(bool hasL,bool hasR,bool alreadyCreped=false) {
  tlog("\n"); sep(); tlog("[RUN2 JCT] L=%d R=%d\n",hasL,hasR);
  long ticksBeforeCreep=getAvgTicks();
  if(!alreadyCreped) creepForward();
  bool ps1,ps2,ps3,ps4,ps5; readSensors(ps1,ps2,ps3,ps4,ps5);
  tlog("[AFTER CREEP] %s\n",pat(ps1,ps2,ps3,ps4,ps5).c_str());
  hasL = hasL || ps1;
  bool hasS = ps2 || ps3 || ps4;
  hasR = hasR || ps5;

  if(!run2JustBacktracked){ currentX+=dX[currentHeading]; currentY+=dY[currentHeading]; tlog("[POS] (%d,%d)\n",currentX,currentY); }
  else{ tlog("[BACKTRACK] stays (%d,%d)\n",currentX,currentY); run2JustBacktracked=false; }

  int vx=goalX-currentX, vy=goalY-currentY;
  tlog("[GOAL] (%d,%d) curr=(%d,%d) vx=%d vy=%d\n",goalX,goalY,currentX,currentY,vx,vy);

  int absH[4]={(currentHeading+3)%4,currentHeading,(currentHeading+1)%4,(currentHeading+2)%4};
  bool avail[4]={hasL,hasS,hasR,true};
  char dirs[4]={'L','S','R','B'};

  for(int i=0;i<4;i++){
    if(avail[i]&&isMoveBad(currentX,currentY,absH[i])){ avail[i]=false; tlog("[SKIP] %c bad\n",dirs[i]); }
  }

  int manhattan[4];
  for(int i=0;i<4;i++){
    int nx=currentX+dX[absH[i]], ny=currentY+dY[absH[i]];
    manhattan[i]=abs(goalX-nx)+abs(goalY-ny);
  }
  tlog("[DIST] L=%d S=%d R=%d B=%d\n",manhattan[0],manhattan[1],manhattan[2],manhattan[3]);

  int currentManhattan=abs(vx)+abs(vy);

  if(currentManhattan==0){
    tlog("[AT GOAL] exploring\n");
    char bestDir=0; int bestIdx=-1;
    for(int p=0;p<3;p++) if(avail[p]){bestDir=dirs[p];bestIdx=p;break;}
    if(!bestDir) bestDir='B';
    run2LastJX=currentX; run2LastJY=currentY;
    if(bestIdx>=0) run2LastAbsDir=absH[bestIdx];
    if(run2Count<MAX_JUNCTIONS) run2Decisions[run2Count++]=bestDir;
    tlog("[DECISION] %c\n",bestDir);
    doTurn(bestDir); resetEncoders(); startEventLockout(); sep(); return;
  }

  bool anyImprovement=false;
  for(int i=0;i<3;i++) if(avail[i]&&manhattan[i]<currentManhattan){anyImprovement=true;break;}

  if(!anyImprovement){
    tlog("[BACKTRACK]\n"); markLastMoveBad();
    currentX-=dX[currentHeading]; currentY-=dY[currentHeading];
    tlog("[POS UNDONE] (%d,%d)\n",currentX,currentY);
    if(run2Count<MAX_JUNCTIONS) run2Decisions[run2Count++]='B';
    doSmartUTurn(hasL,hasS,hasR); resetEncoders();
    run2JustBacktracked=true; startEventLockout(); sep(); return;
  }

  bool prioritizeX=(abs(vx)>=abs(vy));
  tlog("[PRIO] %s-axis |vx|=%d |vy|=%d\n",prioritizeX?"X":"Y",abs(vx),abs(vy));

  char bestDir=0; int bestIdx=-1;

  for(int p=0;p<4;p++){
    if(!avail[p]||manhattan[p]>=currentManhattan) continue;
    int nx=currentX+dX[absH[p]], ny=currentY+dY[absH[p]];
    bool reduces=prioritizeX?(abs(goalX-nx)<abs(vx)):(abs(goalY-ny)<abs(vy));
    if(reduces){ bestDir=dirs[p]; bestIdx=p; break; }
  }
  if(!bestDir){
    for(int p=0;p<4;p++){
      if(!avail[p]||manhattan[p]>=currentManhattan) continue;
      int nx=currentX+dX[absH[p]], ny=currentY+dY[absH[p]];
      bool reduces=prioritizeX?(abs(goalY-ny)<abs(vy)):(abs(goalX-nx)<abs(vx));
      if(reduces){ bestDir=dirs[p]; bestIdx=p; break; }
    }
  }
  if(!bestDir){
    for(int p=0;p<4;p++) if(avail[p]&&manhattan[p]<currentManhattan){ bestDir=dirs[p]; bestIdx=p; break; }
  }

  run2LastJX=currentX; run2LastJY=currentY;
  if(bestIdx>=0) run2LastAbsDir=absH[bestIdx];
  tlog("[DECISION] %c (%s)\n",bestDir,bestIdx>=0?hShort(absH[bestIdx]):"?");
  if(run2Count<MAX_JUNCTIONS) run2Decisions[run2Count++]=bestDir;

  long corridorTicks=(bestDir=='S')?getAvgTicks():ticksBeforeCreep;
  doTurn(bestDir); resetEncoders(); startEventLockout(); sep();
}

void handleReturnStep(bool alreadyCreped=false) {
  tlog("\n"); sep(); tlog("[RETURN] %d/%d\n",returnPathIdx+1,returnPathLen);
  if(!alreadyCreped) creepForward();
  if(returnPathIdx>=returnPathLen){tlog("[RETURN] Done\n");return;}
  char turn=returnPath[returnPathIdx++]; tlog("[TURN] %c\n",turn);
  doTurn(turn); startEventLockout(); sep();
}

void handleBack2Step(bool alreadyCreped=false) {
  tlog("\n"); sep(); tlog("[BACK2] %d/%d\n",back2PathIdx+1,back2PathLen);
  if(!alreadyCreped) creepForward();
  if(back2PathIdx>=back2PathLen){tlog("[BACK2] Done\n");return;}
  char turn=back2Path[back2PathIdx++]; tlog("[TURN] %c\n",turn);
  doTurn(turn); startEventLockout(); sep();
}

void lineFollowStep(bool s1,bool s2,bool s3,bool s4,bool s5) {
  bothForward();
  int weights[5]={-2,-1,0,1,2}; bool sens[5]={s1,s2,s3,s4,s5};
  int cnt=0,wsum=0;
  for(int i=0;i<5;i++) if(sens[i]){wsum+=weights[i];cnt++;}
  int error; if(cnt>0){error=wsum;lastError=error;} else{error=(lastError<0)?-4:(lastError>0)?4:0;}
  int absErr=abs(error),corr;
  if(absErr==0) corr=0; else if(absErr==1) corr=CORR_TIER1; else if(absErr==2) corr=CORR_TIER2;
  else if(absErr==3) corr=CORR_TIER3; else corr=CORR_TIER4;
  if(error<0) corr=-corr;
  setPWM(constrain(BASE_SPEED+corr,MIN_SPEED,MAX_SPEED),constrain(BASE_SPEED-corr,MIN_SPEED,MAX_SPEED));
}

void setup() {
  Serial.begin(115200); delay(1000);
  pinMode(STBY_PIN,OUTPUT);
  pinMode(LEFT_IN1,OUTPUT);pinMode(LEFT_IN2,OUTPUT);
  pinMode(RIGHT_IN1,OUTPUT);pinMode(RIGHT_IN2,OUTPUT);
  pinMode(S1,INPUT);pinMode(S2,INPUT);pinMode(S3,INPUT);pinMode(S4,INPUT);pinMode(S5,INPUT);
  ledcSetup(LEFT_CH,PWM_FREQ,PWM_RES); ledcAttachPin(LEFT_PWM,LEFT_CH);
  ledcSetup(RIGHT_CH,PWM_FREQ,PWM_RES); ledcAttachPin(RIGHT_PWM,RIGHT_CH);
  digitalWrite(STBY_PIN,HIGH); stopMotors();
  pinMode(ENC_LEFT_A,INPUT_PULLUP); pinMode(ENC_RIGHT_A,INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_LEFT_A), isrLeftA, RISING);
  attachInterrupt(digitalPinToInterrupt(ENC_RIGHT_A),isrRightA,RISING);
  Serial.println("[ENC] Interrupts attached");

  BLEDevice::init(BLE_DEVICE_NAME); BLEDevice::setMTU(512);
  pBLEServer=BLEDevice::createServer(); pBLEServer->setCallbacks(new RoboServerCallbacks());
  BLEService* pService=pBLEServer->createService(BLE_SERVICE_UUID);
  pTxChar=pService->createCharacteristic(BLE_TX_CHAR_UUID,BLECharacteristic::PROPERTY_NOTIFY);
  pTxChar->addDescriptor(new BLE2902());
  pRxChar=pService->createCharacteristic(BLE_RX_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE|BLECharacteristic::PROPERTY_WRITE_NR);
  pRxChar->setCallbacks(new BLERxCallbacks());
  pService->start();
  BLEAdvertising* pAdv=BLEDevice::getAdvertising();
  pAdv->addServiceUUID(BLE_SERVICE_UUID); pAdv->setScanResponse(true);
  pAdv->setMinPreferred(0x06); BLEDevice::startAdvertising();
  Serial.println("[BLE] Advertising as 'RoboMaze'");

  WiFi.config(staticIP,gateway,subnet,dns);
  Serial.printf("WiFi connecting to %s...",WIFI_SSID);
  WiFi.begin(WIFI_SSID,WIFI_PASS);
  unsigned long wStart=millis();
  while(WiFi.status()!=WL_CONNECTED&&millis()-wStart<5000){ delay(500); Serial.print("."); }
  if(WiFi.status()==WL_CONNECTED){
    wifiConnected=true;
    Serial.printf("\n[WiFi] %s\n",WiFi.localIP().toString().c_str());
    telnetServer.begin(); wsServer.begin(); wsServer.onEvent(onWebSocketEvent);
    Serial.println("[WS] Port 81 ready");
  } else { wifiConnected=false; Serial.println("\n[WiFi] FAILED — BLE only"); }

  Serial.printf("Heap: %d\n",ESP.getFreeHeap());
  bigSep();
  Serial.println("  MAZE ROBOT v3.0");
  Serial.printf("  WiFi: %s\n",wifiConnected?"CONNECTED":"BLE ONLY");
  Serial.println("  L:S1  S:S2|S3|S4  R:S5");
  Serial.println("  BLE: telem+junction+event+path (no logs)");
  bigSep();
  robotState=STATE_IDLE;
}

void loop() {
  handleTelnet();
  if(wifiConnected) wsServer.loop();
  updateSensorGlobals(); broadcastTelemetry(); checkCommands();
  if(bleWasConnected&&!bleConnected){ bleWasConnected=false; BLEDevice::startAdvertising(); tlog("[BLE] Adv restarted\n"); }
  if(robotPaused) return;
  if(robotState==STATE_IDLE||robotState==STATE_MANUAL||
     robotState==STATE_WAITING_BACK||robotState==STATE_WAITING_RUN2||
     robotState==STATE_WAITING_BACK2) return;

  bool s1,s2,s3,s4,s5; readSensors(s1,s2,s3,s4,s5);
  int bc=countBlack(s1,s2,s3,s4,s5);
  if(millis()<eventLockoutUntil){ lineFollowStep(s1,s2,s3,s4,s5); return; }

  if(bc>=3){
    stopMotors(); delayWS(SETTLE_TIME);
    bool rs1,rs2,rs3,rs4,rs5; readSensors(rs1,rs2,rs3,rs4,rs5);
    int rbc=countBlack(rs1,rs2,rs3,rs4,rs5);
    tlog("\n"); sep(); tlog("[STOP] %s count=%d state=%s\n",pat(rs1,rs2,rs3,rs4,rs5).c_str(),rbc,stateStr());
    bool settledL=rs1, settledR=rs5, alreadyCreped=false;

    if(rbc>=4){
      tlog("[GOAL/START?]\n");
      bothForward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(GOAL_CREEP_TIME); stopMotors(); delay(STOP_PAUSE);
      bool gs1,gs2,gs3,gs4,gs5; readSensors(gs1,gs2,gs3,gs4,gs5);
      int gbc=countBlack(gs1,gs2,gs3,gs4,gs5);
      tlog("[CHECK] %s count=%d\n",pat(gs1,gs2,gs3,gs4,gs5).c_str(),gbc);
      if(gbc>=4){
        stopMotors();
        if(robotState==STATE_LHR){
          goalX=currentX+dX[currentHeading]; goalY=currentY+dY[currentHeading];
          broadcastGoalNode(); printLHRMap(); tlog("  GOAL at (%d,%d)\n",goalX,goalY);
          robotState=STATE_WAITING_BACK; broadcastEvent("WAITING_BACK","Goal — send back"); return;
        }
        else if(robotState==STATE_RETURNING){
          tlog("  START REACHED\n");
          bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(JUNCTION_CREEP_TIME); stopMotors(); delayWS(200);
          doTurn('B'); waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE);
          currentX=0; currentY=0; currentHeading=0;
          robotState=STATE_WAITING_RUN2; broadcastEvent("WAITING_RUN2","At start — send run2"); return;
        }
        else if(robotState==STATE_RUN2){
          currentX+=dX[currentHeading]; currentY+=dY[currentHeading]; printRun2Map();
          tlog("  RUN2 GOAL at (%d,%d)\n",currentX,currentY);
          robotState=STATE_WAITING_BACK2; broadcastEvent("WAITING_BACK2","Run2 goal — send back2"); return;
        }
        else if(robotState==STATE_BACK2){
          tlog("  ALL COMPLETE\n");
          bothBackward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(JUNCTION_CREEP_TIME); stopMotors(); delayWS(200);
          doTurn('B'); waitForLine(SEARCH_TIMEOUT); stopMotors(); delay(STOP_PAUSE);
          printFullSummary(); robotState=STATE_IDLE; broadcastEvent("COMPLETE","All done"); return;
        }
      }
      unsigned long topUp=(JUNCTION_CREEP_TIME>GOAL_CREEP_TIME)?(JUNCTION_CREEP_TIME-GOAL_CREEP_TIME):0;
      if(topUp>0){ bothForward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(topUp); stopMotors(); delay(STOP_PAUSE); }
      alreadyCreped=true;
      readSensors(gs1,gs2,gs3,gs4,gs5);
      settledL=settledL||gs1; settledR=settledR||gs5;
      tlog("[JCT] L=%d R=%d\n",settledL,settledR);
    }

    tlog("[JCT TYPE] L=%d R=%d C=%d\n",settledL,settledR,rs3);

    if(robotState==STATE_LHR){
      if(!settledL&&!settledR){
        if(rs2||rs3||rs4){ tlog("[UNCLEAR]\n"); handleJunctionLHR(false,false,alreadyCreped); }
        else{ tlog("[DEAD END]\n"); long ct=getAvgTicks(); recordJunction(false,false,false,'B',ct); resetEncoders(); doTurn('B'); startEventLockout(); }
      } else handleJunctionLHR(settledL,settledR,alreadyCreped);
    }
    else if(robotState==STATE_RETURNING) handleReturnStep(alreadyCreped);
    else if(robotState==STATE_RUN2){
      if(!settledL&&!settledR){
        if(rs2||rs3||rs4){ tlog("[UNCLEAR]\n"); handleJunctionRun2(false,false,alreadyCreped); }
        else{ tlog("[RUN2 DEAD END]\n"); markLastMoveBad(); run2JustBacktracked=true; doTurn('B'); startEventLockout(); }
      } else handleJunctionRun2(settledL,settledR,alreadyCreped);
    }
    else if(robotState==STATE_BACK2) handleBack2Step(alreadyCreped);
    return;
  }

  static bool deadActive=false; static unsigned long deadStart=0;
  bool anyLine=s1||s2||s3||s4||s5;
  if(!anyLine){
    if(!deadActive){deadActive=true;deadStart=millis();}
    if(millis()-deadStart>=LINE_LOST_TIMEOUT_MS){
      stopMotors(); delay(STOP_PAUSE); deadActive=false; tlog("\n[LINE LOST]\n");
      resetEncoders(); bothForward(); setPWM(BASE_SPEED,BASE_SPEED); delayWS(PEEK_CREEP_TIME); stopMotors(); delay(STOP_PAUSE);
      bool pk1,pk2,pk3,pk4,pk5; readSensors(pk1,pk2,pk3,pk4,pk5);
      int pkc=countBlack(pk1,pk2,pk3,pk4,pk5);
      tlog("[PEEK] %s %d\n",pat(pk1,pk2,pk3,pk4,pk5).c_str(),pkc);
      bool pL=pk1, pR=pk5;
      if(pkc>=3){
        if(robotState==STATE_LHR){ if(pL||pR) handleJunctionLHR(pL,pR); else{ long ct=getAvgTicks(); recordJunction(false,false,false,'B',ct); resetEncoders(); doTurn('B'); startEventLockout(); } }
        else if(robotState==STATE_RETURNING) handleReturnStep();
        else if(robotState==STATE_RUN2){ if(pL||pR) handleJunctionRun2(pL,pR); else{ tlog("[RUN2 DEAD END]\n"); markLastMoveBad(); run2JustBacktracked=true; doTurn('B'); startEventLockout(); } }
        else if(robotState==STATE_BACK2) handleBack2Step();
      } else {
        if(robotState==STATE_LHR){ tlog("[DEAD END]\n"); long ct=getAvgTicks(); recordJunction(false,false,false,'B',ct); resetEncoders(); doTurn('B'); startEventLockout(); }
        else if(robotState==STATE_RETURNING) handleReturnStep();
        else if(robotState==STATE_RUN2){ tlog("[RUN2 DEAD END]\n"); markLastMoveBad(); run2JustBacktracked=true; doTurn('B'); startEventLockout(); }
        else if(robotState==STATE_BACK2) handleBack2Step();
      }
    }
    return;
  } else { deadActive=false; }

  lineFollowStep(s1,s2,s3,s4,s5);
}