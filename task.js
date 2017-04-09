let mod = {};
module.exports = mod;
mod.tasks = [];
mod.populate = function() {
    Task.addTasks(...[
        Task.attackController,
        Task.claim,
        Task.defense,
        Task.guard,
        Task.labTech,
        Task.mining,
        Task.pioneer,
        Task.reputation,
        Task.reserve,
        Task.robbing,
    ]);
};
mod.addTasks = (...task) => Task.tasks.push(...task);

mod.installTask = (...taskNames) => {
    taskNames.forEach(taskName => {
        Task[taskName] = load(`task.${taskName}`);
        Task.addTasks(Task[taskName]);
    });
};
// load task memory & flush caches
mod.flush = function () {
    Task.tasks.forEach(task => {
        if (task.flush) task.flush();
    });
};
// temporary hack to avoid registering twice internally, remove and fix internal when merged.
mod.selfRegister = true;
// register tasks (hook up into events)
mod.register = function () {
    Task.tasks.forEach(task => {
        // Extending of any other kind
        if (task.register) task.register();
        // Flag Events
        if (task.handleFlagFound) Flag.found.on(flag => task.handleFlagFound(flag));
        if (task.handleFlagRemoved) Flag.FlagRemoved.on(flagName => task.handleFlagRemoved(flagName));
        // Creep Events
        if (task.handleSpawningStarted) Creep.spawningStarted.on(params => task.handleSpawningStarted(params));
        if (task.handleSpawningCompleted) Creep.spawningCompleted.on(creep => task.handleSpawningCompleted(creep));
        if (task.handleCreepDied) {
            Creep.predictedRenewal.on(creep => task.handleCreepDied(creep.name));
            Creep.died.on(name => task.handleCreepDied(name));
        }
        if (task.handleCreepError) Creep.error.on(errorData => task.handleCreepError(errorData));
        // Room events
        if (task.handleNewInvader) Room.newInvader.on(invader => task.handleNewInvader(invader));
        if (task.handleKnownInvader) Room.knownInvader.on(invaderID => task.handleKnownInvader(invaderID));
        if (task.handleGoneInvader) Room.goneInvader.on(invaderID => task.handleGoneInvader(invaderID));
        if (task.handleRoomDied) Room.collapsed.on(room => task.handleRoomDied(room));
    });
};
mod.memory = (task, s) => { // task:  (string) name of the task, s: (string) any selector for that task, could be room name, flag name, enemy name
    if( !Memory.tasks ) Memory.tasks = {};
    if( !Memory.tasks[task] ) Memory.tasks[task] = {};
    if( !Memory.tasks[task][s] ) Memory.tasks[task][s] = {};
    return Memory.tasks[task][s];
};
mod.clearMemory = (task, s) => {
    if( Memory.tasks[task] && Memory.tasks[task][s] )
        delete Memory.tasks[task][s];
};
mod.cache = (task, s) => {
    if( !cache[task] ) cache[task] = {};
    if( !cache[task][s] ) cache[task][s] = {};
    return cache[task][s];
};
mod.clearCache = (task, s) => {
    if( cache[task] && cache[task][s] )
        delete cache[task][s];
};
// creepDefinition: { queue, name, behaviour, fixedBody, multiBody }
// destiny: { task, targetName }
// roomParams: { targetRoom, minRCL = 0, maxRange = Infinity, minEnergyAvailable = 0, minEnergyCapacity = 0, callBack = null, allowTargetRoom = false, rangeRclRatio = 3, rangeQueueRatio = 51 }
mod.spawn = (creepDefinition, destiny, roomParams, onQueued) => {
    // get nearest room
    let room = roomParams.explicit ? Game.rooms[roomParams.explicit] : Room.findSpawnRoom(roomParams);
    if( !room ) return null;
    // define new creep
    if(!destiny) destiny = {};
    if(!destiny.room && roomParams.targetRoom) destiny.room = roomParams.targetRoom;

    let parts = Creep.compileBody(room, creepDefinition);

    let name = `${creepDefinition.name || creepDefinition.behaviour}-${destiny.targetName}`;
    let creepSetup = {
        parts: parts,
        name: name,
        behaviour: creepDefinition.behaviour,
        destiny: destiny,
        queueRoom: room.name
    };
    if( creepSetup.parts.length === 0 ) {
        // creep has no body. 
        global.logSystem(flag.pos.roomName, dye(CRAYON.error, `${destiny.task} task tried to queue a zero parts body ${creepDefinition.behaviour} creep. Aborted.` ));
        return null;
    }
    // queue creep for spawning
    let queue = room['spawnQueue' + creepDefinition.queue] || room.spawnQueueLow;
    queue.push(creepSetup);
    // save queued creep to task memory
    if( onQueued ) onQueued(creepSetup);
    return creepSetup;
};
mod.validateQueued = function(memory, options = {}) {
    const subKey = options.subKey ? 'queued.' + options.subKey : 'queued';
    const queued = Util.get(memory, subKey, []);
    // if checkValid = true, it will only revalidate if 50 ticks have passed since the last validation
    if (queued.length && !options.checkValid || !memory.queuedValid || Game.time - memory.queuedValid > 50) {
        const queues = options.queues || ['Low'];
        const validated = [];
        const _validateQueued = entry => {
            const room = Game.rooms[entry.room];
            for (const queue of queues) {
                if (room['spawnQueue' + queue].some(c => c.name === entry.name)) {
                    validated.push(entry);
                    break;
                }
            }
        };
        queued.forEach(_validateQueued);
        _.set(memory, subKey, validated);
        memory.queuedValid = Game.time;
    }
};
mod.validateSpawning = function(memory) {
    const validated = [];
    const _validateSpawning = entry => {
        const spawn = Game.spawns[entry.spawn];
        if( spawn && ((spawn.spawning && spawn.spawning.name === entry.name) || (spawn.newSpawn && spawn.newSpawn.name === entry.name))) {
            validated.push(entry);
        }
    };
    memory.forEach(_validateSpawning);
    return validated;
};
mod.validateRunning = function(memory, roomName, deadCreep = '') {
    const validated = [];
    const _validateRunning = name => {
        // invalidate dead or old creeps for predicted spawning
        const creep = Game.creeps[name];
        // invalidate old creeps for predicted spawning
        if( !creep || !creep.data ) return;
        // TODO: better distance calculation
        let prediction;
        if( creep.data.predictedRenewal ) prediction = creep.data.predictedRenewal;
        else if( creep.data.spawningTime ) prediction = (creep.data.spawningTime + (routeRange(creep.data.homeRoom, roomName) * 50));
        else prediction = (routeRange(creep.data.homeRoom, roomName) + 1) * 50;
        if( creep.name !== deadCreep && creep.ticksToLive > prediction ) {
            validated.push(name);
        }
    };
    memory.forEach(_validateRunning);
    return validated;
};
const cache = {};
