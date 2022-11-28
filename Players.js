handlers.AssignPresets = function (args) {
    var titleData = {};
    titleData.presets = "[{\"selected\":true,\"robot\":\"R1\",\"skin\":\"1B\",\"head\":\"1H1\",\"attachment\":\"1A1\",\"attachmentSkin\":\"11B\",\"weapons\":[\"AS\",\"NC\"]}]";

    server.UpdateUserData({
        PlayFabId: currentPlayerId,
        Data: titleData
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
                        var catalogCustomData = catalogItem.CustomData;
                        if (catalogCustomData != undefined) {
                            catalogCustomData = JSON.parse(catalogCustomData);
                            log.debug("Catalog custom data", catalogCustomData);
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
                                instanceCustomData.level = catalogCustomData.xpByLevel.length - 1;
                                break CalculateLevel;
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
    return "Player " + args.robotInstanceId + " XP was " + oldXP + " and now is " + instanceCustomData.xp;
}

handlers.GetDisplayNames = function (args) {
    const ids = args.ids; //[]
    var entities = [];
    var response = [];

    for (let i = 0; i < ids.length; i++) {
        entities.push({ Id: ids[i], Type: "title_player_account" });
    }
    var playerProfiles = entity.GetProfiles({ Entities: entities });

    log.debug("GetProfiles response: " + JSON.stringify(playerProfiles));

    for (let i = 0; i < playerProfiles.Profiles.length; i++) {
        const profile = playerProfiles.Profiles[i];
        const masterAccountId = profile.Lineage.MasterPlayerAccountId;
        var masterProfile = server.GetPlayerProfile({ PlayFabId: masterAccountId });
        var nftMultiplier = GetUserNFTMultiplier(masterAccountId);
        var displayName = masterProfile.PlayerProfile.DisplayName;
        if (nftMultiplier > 1) {
            displayName += "<sprite name = \"ui_icon_nft\">";
        }
        // log.debug("Profile detected", masterProfile);
        response.push({ Id: profile.Entity.Id, DisplayName: displayName });
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

GetNFTMultiplier = function (playerEntityId) {
    var playerId = entity.GetProfile({ Entity: { Id: playerEntityId, Type: "title_player_account" } }).Profile.Lineage.MasterPlayerAccountId;
    return GetUserNFTMultiplier(playerId);
}

GetUserNFTMultiplier = function (playerId) {
    var multiplier = 1;
    var data = server.GetUserData({ PlayFabId: playerId, Keys: ["nftData"] }).Data;
    if (data.nftData != null) {
        var nftData = JSON.parse(data.nftData.Value);
        if (nftData.multiplier != null) {
            multiplier = nftData.multiplier;
        }
    }
    return multiplier;
}

handlers.VerifyNFTBundle = function (args) {
    const BUNDLE_ID = "BUNDLE_NFT_HOLDERS";

    var multiplier = GetUserNFTMultiplier(currentPlayerId);

    var isNFTHolder = multiplier > 1;


    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory; //ItemInstance[]
    for (let i = 0; i < inventory.length; i++) {
        const itemInstance = inventory[i];
        if (itemInstance.ItemId == BUNDLE_ID) {
            if (isNFTHolder) {
                log.debug("Player already received the bundle.")
            } else {
                //revoke bundle.
            }
            return;
        }
    }

    if (isNFTHolder) {
        server.GrantItemsToUser({ ItemIds: [BUNDLE_ID], PlayFabId: currentPlayerId });
        log.debug("Bundle was grant to user because is a NFTHolder.")
    }
    return;
}