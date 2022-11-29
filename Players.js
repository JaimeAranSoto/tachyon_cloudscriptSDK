handlers.AssignPresets = function (args) {
    var titleData = {};
    titleData.presets = "[{\"selected\":true,\"robot\":\"R1\",\"skin\":\"1B\",\"head\":\"1H1\",\"attachment\":\"1A1\",\"attachmentSkin\":\"11B\",\"weapons\":[\"AS\",\"NC\"]}]";

    server.UpdateUserData({
        PlayFabId: currentPlayerId,
        Data: titleData
    });
}

handlers.RobotUpgrade = function (args) {
    const robot = GetItem(args.robotInstanceId);

    if (robot == null || robot === undefined) {
        log.debug("Mech is not in player's inventory");
        return 0;
    }

    if (robot.CustomData == null) {
        // Check this custom data
        robot.CustomData = { Level: 0, UpgradeTimeStamp: -1 };
    }

    var isCurrentlyUpdating = robot.CustomData.UpgradeTimeStamp !== undefined && robot.CustomData.UpgradeTimeStamp != -1;

    if (!isCurrentlyUpdating) {
        //return -1; //Robot is not currently upgrading!
    }

    const inventoryResult = server.GetUserInventory({ PlayFabId: currentPlayerId });

    const TACHYON = "TK";
    const playerTachyon = inventoryResult.VirtualCurrency[TACHYON];

    const json = server.GetTitleData({ Keys: ["robotUpgradeCost"] }).Data.robotUpgradeCost;
    const cost = JSON.parse(json);

    const tachyonCost = (cost[robot.CustomData.Level].time / 60) * 10;
    log.debug("Tachyon cost: " + tachyonCost);

    if (playerTachyon < tachyonCost) {
        log.debug("User has not enough Tachyon");
        return -2;
    }

    UpgradeWeapon(args.robotInstanceId, currentPlayerId);
    server.SubtractUserVirtualCurrency({ Amount: tachyonCost, PlayFabId: currentPlayerId, VirtualCurrency: TACHYON });
    log.debug("Mech upgraded successfully");
    return 1;
}

handlers.UpdateRobotStandardUpgrade = function (args) {
    var robotInstanceId = args.robotInstanceId;

    var robot = GetItem(robotInstanceId);

    if (robot === undefined || robot == null) {
        log.debug("Mech is not in player's inventory");
        return null;
    }

    if (robot.CustomData === undefined || Object.keys(robot.CustomData).length === 0) { //Fill CustomData if it's empty.
        server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: robotInstanceId, Data: { Level: 1 } }); // Check if this is correct
    }

    var isCurrentlyUpdating = robot.CustomData.UpgradeTimeStamp !== undefined && robot.CustomData.UpgradeTimeStamp >= 0;
    var upgradeTimeStamp = null; //Default if it's not currently upgrading

    if (isCurrentlyUpdating) {

        upgradeTimeStamp = parseInt(robot.CustomData.UpgradeTimeStamp);
        var json = server.GetTitleData({ Keys: ["upgradeCost"] }).Data.upgradeCost;
        var cost = JSON.parse(json);

        var timeToUpgradeWeapon = cost[robot.CustomData.Level].time * 60000; //minutes -> milliseconds

        log.debug("Time needed to upgrade the weapon", timeToUpgradeWeapon);
        log.debug("Time that has passed since upgrade start", Date.now() - upgradeTimeStamp);

        if (Date.now() - upgradeTimeStamp >= timeToUpgradeWeapon) {
            UpgradeWeapon(robotInstanceId, currentPlayerId);
            server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: robotInstanceId, Data: { UpgradeTimeStamp: -1 } });

        }

        var timeRemaining = timeToUpgradeWeapon - (Date.now() - upgradeTimeStamp);
        if (timeRemaining < 0) timeRemaining = -1;
        return timeRemaining;
    } else {
        log.debug("Weapon is not upgrading!");
        return null;
    }
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
            displayName += "<sprite name=\"ui_icon_nft\">";
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