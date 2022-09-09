handlers.AssignPresets = function (args) {
    var dataPayload = {};

    dataPayLoad["presets"] = "1_1:R1-1W-MG,EC,GR,CR,PG,AG,|2:R1-1W-00,00,00,00,00,00,|3:R1-1W-00,00,00,00,00,00,|4:R1-1W-00,00,00,00,00,00,|5:R1-1W-00,00,00,00,00,00,|";

    var result = server.UpdateUserData({
        PlayFabId: currentPlayerId,
        Data: dataPayLoad
    });
}

handlers.AddRobotXP = function (args) {
    var addition = args.addition;

    var robot = GetItem(args.robotInstanceId);
    var customData = robot.CustomData;
    var JSONObject = JSON.parse(customData);

    JSONObject.xp += addition;


    server.UpdateUserInventoryItemCustomData({ ItemInstanceId: args.robotInstanceId, PlayFabId: currentPlayerId, Data: JSONObject });
}