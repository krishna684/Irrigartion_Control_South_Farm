function fillPlants(id,emoji,count){
  const el=document.getElementById(id);
  if(!el)return;
  el.innerHTML="";
  for(let i=0;i<count;i++){
    const p=document.createElement("span");
    p.className="plant";
    p.textContent=emoji;
    el.appendChild(p);
  }
}

function seed(){
  fillPlants("shed-plants","🌱",10);
  fillPlants("plants1","🌸",20);
  fillPlants("plants2","💐",20);
  ["3a","3b","3c","3d","4a","4b","4c","4d","5a","5b","5c","5d","6a","6b","6c","6d"]
    .forEach(id=>fillPlants("plants"+id,"🌱",10));
}
seed();

function addEffects(el){
  for(let i=0;i<4;i++){
    const drop=document.createElement("div");
    drop.className="drop";drop.textContent="💧";
    drop.style.left=Math.random()*80+"%";
    drop.style.top="0px";
    drop.style.animationDelay=(Math.random()*1)+"s";
    el.appendChild(drop);
  }
  for(let i=0;i<2;i++){
    const spark=document.createElement("div");
    spark.className="sparkle";spark.textContent="✨";
    spark.style.left=Math.random()*80+"%";
    spark.style.top=Math.random()*20+"%";
    spark.style.animationDelay=(Math.random()*1)+"s";
    el.appendChild(spark);
  }
}
function clearEffects(el){el.querySelectorAll(".drop,.sparkle").forEach(e=>e.remove());}

function logout() {
  // Clear login session
  sessionStorage.removeItem('farmControlLoggedIn');
  // Redirect to login page
  window.location.href = 'login.html';
}

// ==== ESPHome WebSocket Integration ====
const HA_URL = "ADDRESS";
const HA_TOKEN = "KEY";

const ENTITIES = {
  pump: "switch.valve_control_submersible_pump",
  valves: {
    "shed": "switch.valve_control_valve_1",     // Turkey Shed
    "row2": "switch.valve_control_valve_2",    // Row 2
    "row1": "switch.valve_control_valve_3",    // Row 1 
    "row4": "switch.valve_control_valve_4",    // Row 4
    "row3": "switch.valve_control_valve_5",    // Row 3
    "row6": "switch.valve_control_valve_6",    // Row 6
    "row5": "switch.valve_control_valve_7"     // Row 5
  },
  pressure1: "sensor.valve_control_water_pressure",
  pressure2: "sensor.valve_control_water_pressure_2"
};

let ws;
let msgId = 1;
const callbacks = {};
let isConnectedToHA = false;

function connectToHomeAssistant() {
  ws = new WebSocket(`wss://${HA_URL}/api/websocket`);

  ws.onopen = () => {
    console.log('Connected to Home Assistant, sending auth...');
    ws.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "auth_ok") {
      isConnectedToHA = true;
      console.log('✅ Connected to Home Assistant');
      
      // Subscribe to state changes
      sendToHA({ type: "subscribe_events", event_type: "state_changed" });
      
      // Get initial states
      sendToHA({ type: "get_states" }, (res) => {
        res.result.forEach(updateFromHA);
      });
    }

    if (data.type === "event" && data.event.event_type === "state_changed") {
      updateFromHA(data.event.data.new_state);
    }

    if (data.id && callbacks[data.id]) {
      callbacks[data.id](data);
      delete callbacks[data.id];
    }
  };

  ws.onclose = () => {
    isConnectedToHA = false;
    console.log('Disconnected from Home Assistant - retrying in 3s');
    setTimeout(connectToHomeAssistant, 3000);
  };

  ws.onerror = (error) => {
    console.log('WebSocket error:', error);
  };
}

function sendToHA(payload, callback) {
  if (!isConnectedToHA) return;
  payload.id = msgId++;
  ws.send(JSON.stringify(payload));
  if (callback) callbacks[payload.id] = callback;
}

function updateFromHA(entity) {
  if (!entity) return;
  
  // Update pressure gauges
  if (entity.entity_id === ENTITIES.pressure1) {
    updatePressureGauge('sensor1', parseFloat(entity.state));
  }
  if (entity.entity_id === ENTITIES.pressure2) {
    updatePressureGauge('sensor2', parseFloat(entity.state));
  }
  
  // Update pump state
  if (entity.entity_id === ENTITIES.pump) {
    const pumpSwitch = document.getElementById('mainPump');
    if (pumpSwitch) {
      pumpSwitch.checked = (entity.state === 'on');
      // Trigger update to sync UI
      pumpSwitch.dispatchEvent(new Event('change'));
    }
  }
  
  // Update valve states
  Object.keys(ENTITIES.valves).forEach(sectionId => {
    if (entity.entity_id === ENTITIES.valves[sectionId]) {
      const section = document.getElementById(sectionId);
      const valve = section?.querySelector('.switch__input');
      if (valve) {
        valve.checked = (entity.state === 'on');
        // Trigger update to sync UI
        valve.dispatchEvent(new Event('change'));
      }
    }
  });
}

function updatePressureGauge(gaugeId, pressure) {
  const gaugeContainer = document.getElementById(gaugeId);
  if (!gaugeContainer) return;
  
  const needleId = gaugeId === 'sensor1' ? 'needle1' : 'needle2';
  const valueId = gaugeId === 'sensor1' ? 'value1' : 'value2';
  
  const needle = document.getElementById(needleId);
  const value = document.getElementById(valueId);
  
  if (needle && value) {
    // Convert pressure (0-150 PSI) to angle (-135deg to +135deg = 270deg range)
    const clampedPressure = Math.min(Math.max(pressure, 0), 150);
    const angle = -135 + (clampedPressure / 150) * 270;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    value.textContent = `${pressure.toFixed(1)} PSI`;
  }
}

function controlHardware(entityId, turnOn) {
  if (!isConnectedToHA) {
    console.log('Not connected to Home Assistant');
    return;
  }
  
  sendToHA({
    type: "call_service",
    domain: "switch",
    service: turnOn ? "turn_on" : "turn_off",
    target: { entity_id: entityId }
  });
}

function updateWaterFlow() {
  const mainPump = document.getElementById("mainPump");
  const pumpOn = mainPump.checked;
  
  // Main system components
  const tank = document.getElementById("tank");
  const motor = document.getElementById("motor");
  const flowmeter = document.getElementById("flowmeter");
  
  // Update main system flow
  tank.classList.toggle("water-flowing", pumpOn);
  motor.classList.toggle("water-flowing", pumpOn);
  flowmeter.classList.toggle("water-flowing", pumpOn);
  
  // Update individual rows/shed
  const sections = ["shed", "row1", "row2", "row3", "row4", "row5", "row6"];
  
  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    const valve = section?.querySelector(".switch__input");
    
    if (section && valve) {
      const shouldFlow = pumpOn && valve.checked;
      section.classList.toggle("water-flowing", shouldFlow);
    }
  });
}

function setup(){
  const mainPump=document.getElementById("mainPump");
  const valves=document.querySelectorAll(".row .switch__input, .shed .switch__input");

  valves.forEach(valve=>{
    const parent=valve.closest(".row, .shed");
    const plants=parent.querySelectorAll(".plant");
    function update(){
      const active=mainPump.checked && valve.checked;
      plants.forEach(p=>p.classList.toggle("watered",active));
      if(active){addEffects(parent);} else{clearEffects(parent);}
      updateWaterFlow(); // Update color wave system
      
      // Control real hardware
      const sectionId = parent.id;
      if (ENTITIES.valves[sectionId]) {
        controlHardware(ENTITIES.valves[sectionId], valve.checked);
      }
    }
    valve.addEventListener("change",update);
    mainPump.addEventListener("change",()=> {
      updateGauges();
      updateWaterFlow();
      // Control real pump
      controlHardware(ENTITIES.pump, mainPump.checked);
      if(mainPump.checked){
        setInterval(updateGauges,2000);
      }
    });
  });



  // Gauges + flowmeter + tank
  function updateGauges(){
    const pumpOn=mainPump.checked;
    
    // Only simulate if not connected to real hardware
    if (!isConnectedToHA) {
      ["sensor1","sensor2"].forEach(id=>{
        const g=document.getElementById(id);
        const needle=g.querySelector(".needle");
        const value=g.querySelector(".value");
        let psi=pumpOn?Math.floor(80+Math.random()*40):0;
        value.textContent=psi+" PSI";
        let angle=-90+(psi/150)*180;
        needle.style.transform=`rotate(${angle}deg)`;
      });
    }

    // update flowmeter + tank text (still simulated)
    document.querySelector("#flowmeter .value").textContent =
      pumpOn ? (5+Math.floor(Math.random()*15))+" L/min" : "0 L/min";
    document.querySelector("#tank .level").textContent =
      pumpOn ? "Full" : "Empty";
  }

  
  // Connect to Home Assistant on startup
  connectToHomeAssistant();
}
setup();



