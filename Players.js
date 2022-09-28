handlers.AssignPresets = function (args) {
    var dataPayload = {};

    dataPayLoad["presets"] = "1_1:R1-1W-MG,EC,GR,CR,PG,AG,|2:R1-1W-00,00,00,00,00,00,|3:R1-1W-00,00,00,00,00,00,|4:R1-1W-00,00,00,00,00,00,|5:R1-1W-00,00,00,00,00,00,|";

    var result = server.UpdateUserData({
        PlayFabId: currentPlayerId,
        Data: dataPayLoad
    });
}

handlers.AddRobotXP = function (args) {
    var addition = Number(args.addition);

    var robot = GetItem(args.robotInstanceId);
    log.debug("Robot:", robot);
    var customData = robot.CustomData;
    log.debug("Robot custom data:", customData);
    if (customData === undefined) {
        var customData = { xp: addition };
    } else {
        if (customData.xp === undefined) {
            customData.xp = Number(addition);
        } else {
            customData.xp = Number(customData.xp) + Number(addition);
        }
    }
    server.UpdateUserInventoryItemCustomData({ ItemInstanceId: args.robotInstanceId, PlayFabId: currentPlayerId, Data: customData });
}