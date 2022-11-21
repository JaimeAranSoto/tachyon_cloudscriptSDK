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
    // log.debug("Robot:", robot);
    var instanceCustomData = robot.CustomData;
    log.debug("Robot custom data:", instanceCustomData);

    var oldXP = 0;

    if (instanceCustomData === undefined) {
        var instanceCustomData = { xp: addition };
    } else {
        if (instanceCustomData.xp === undefined) {
            instanceCustomData.xp = Number(addition);
        } else {
            oldXP = instanceCustomData.xp;
            instanceCustomData.xp = Number(instanceCustomData.xp) + Number(addition);
        }
    }

    CalculateLevel: {
        var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory; //ItemInstance[]
        for (let i = 0; i < inventory.length; i++) {
            const item = inventory[i];
            if (item.ItemInstanceId == args.robotInstanceId) {
                var catalogItemId = item.ItemId;
                log.debug("Catalog itemId found", catalogItemId);

                var catalog = server.GetCatalogItems({}).Catalog; //CatalogItem[]
                for (let j = 0; j < catalog.length; j++) {
                    const catalogItem = catalog[j];
                    if (catalogItem.ItemId == catalogItemId) {
                        log.debug("Catalog item found", catalogItem);
                        var catalogCustomData = catalogItem.CustomData;
                        if (catalogCustomData != undefined) {
                            catalogCustomData = JSON.parse(catalogCustomData);
                            if (catalogCustomData.xpByLevel != undefined) {
                                for (let k = 0; k < catalogCustomData.xpByLevel.length; k++) {
                                    const requiredXP = catalogCustomData.xpByLevel[k];
                                    if (instanceCustomData.xp <= requiredXP) {
                                        instanceCustomData.level = k;
                                        log.debug("XP:", instanceCustomData.xp);
                                        log.debug("Level:", k);
                                        break CalculateLevel;
                                    }
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }
    log.debug("New instance custom data", instanceCustomData);
    server.UpdateUserInventoryItemCustomData({ ItemInstanceId: args.robotInstanceId, PlayFabId: currentPlayerId, Data: instanceCustomData });
    return "Player " + robotInstanceId + " XP was " + oldXP + " and now is " + customData.xp;
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
    var data = server.GetUserData({ PlayFabId: titleId, Keys: ["nftData"] }).Data;
    if (data.nftData != null) {
        var nftData = JSON.parse(data.nftData.Value);
        if (nftData.multiplier != null) {
            multiplier = nftData.multiplier;
        }
    }
    return multiplier;
}