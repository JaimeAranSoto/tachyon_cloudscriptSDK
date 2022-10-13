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

handlers.GetDisplayNames = function (args) {
    var ids = args.ids; //[]
    var entities = [];
    var response = [];

    for (let i = 0; i < ids.length; i++) {
        entities.push({ Id: ids[i], Type: "title_player_account" });
    }
    console.log("Entities", entities);
    var playerProfiles = entity.GetProfiles({ Entities: entities });

    for (let i = 0; i < playerProfiles.length; i++) {
        const profile = playerProfiles[i];

        response.push(profile.DisplayName);
    }
    console.log("Profiles", playerProfiles);
    return response;

}