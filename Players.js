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

    var oldXP = 0;

    if (customData === undefined) {
        var customData = { xp: addition };
    } else {
        if (customData.xp === undefined) {
            customData.xp = Number(addition);
        } else {
            oldXP = customData.xp;
            customData.xp = Number(customData.xp) + Number(addition);
        }
    }
    server.UpdateUserInventoryItemCustomData({ ItemInstanceId: args.robotInstanceId, PlayFabId: currentPlayerId, Data: customData });
    return "Player ${robotInstanceId} XP was ${oldXP} and now is ${customData.xp}";
}

handlers.GetDisplayNames = function (args) {
    var ids = args.ids; //[]
    var entities = [];
    var response = [];

    for (let i = 0; i < ids.length; i++) {
        entities.push({ Id: ids[i], Type: "title_player_account" });
    }
    //log.debug("Entities", entities);
    var playerProfiles = entity.GetProfiles({ Entities: entities });
    // log.debug("GetProfiles response", playerProfiles);

    // log.debug("PlayerProfiles", playerProfiles);
    for (let i = 0; i < playerProfiles.Profiles.length; i++) {
        const profile = playerProfiles.Profiles[i];
        var masterProfile = server.GetPlayerProfile({ PlayFabId: profile.Lineage.MasterPlayerAccountId });
        // log.debug("Profile detected", masterProfile);
        response.push({ Id: profile.Entity.Id, DisplayName: masterProfile.PlayerProfile.DisplayName });
    }

    //log.debug("Profiles", response);
    return response;
}

GetEntityId = function (playerId) {
    var userInfo = server.GetUserAccountInfo({ PlayFabId: playerId }).UserInfo;
    var myEntity = userInfo.TitleInfo.TitlePlayerAccount;
    var myEntityId = myEntity.Id;
    return myEntityId;
}

GetNFTMultiplier = function (playerId) {
    var titleId = entity.GetProfile({ Entity: { Id: playerId, Type: "title_player_account" } }).Profile.Lineage.MasterPlayerAccountId;
    var multiplier = 1;
    var titleData = server.GetUserData({ PlayFabId: titleId, Keys: ["nftData"] }).Data;
    if (titleData.Value != null) {
        var nftData = JSON.parse(titleData.Value);
        if (nftData.multiplier != null) {
            multiplier = nftData.multiplier;
        }
    }
    return multiplier;
}