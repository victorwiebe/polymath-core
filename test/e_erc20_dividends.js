import latestTime from './helpers/latestTime';
import { duration, promisifyLogWatch, latestBlock } from './helpers/utils';
import takeSnapshot, { increaseTime, revertToSnapshot } from './helpers/time';
import { catchRevert } from './helpers/exceptions';
import { setUpPolymathNetwork } from './helpers/createInstances';

const SecurityToken = artifacts.require('./SecurityToken.sol');
const GeneralTransferManager = artifacts.require('./GeneralTransferManager');
const ERC20DividendCheckpointFactory = artifacts.require('./ERC20DividendCheckpointFactory.sol');
const ERC20DividendCheckpoint = artifacts.require('./ERC20DividendCheckpoint');

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")) // Hardcoded development port

contract('ERC20DividendCheckpoint', accounts => {

    // Accounts Variable declaration
    let account_polymath;
    let account_issuer;
    let token_owner;
    let account_investor1;
    let account_investor2;
    let account_investor3;
    let account_investor4;
    let account_temp;

    // investor Details
    let fromTime = latestTime();
    let toTime = latestTime();
    let expiryTime = toTime + duration.days(15);

    let message = "Transaction Should Fail!";
    let dividendName = "0x546573744469766964656e640000000000000000000000000000000000000000";

    // Contract Instance Declaration
    let I_GeneralTransferManagerFactory;
    let I_SecurityTokenRegistryProxy;
    let I_ERC20DividendCheckpointFactory;
    let P_ERC20DividendCheckpointFactory;
    let P_ERC20DividendCheckpoint;
    let I_GeneralPermissionManager;
    let I_ERC20DividendCheckpoint;
    let I_GeneralTransferManager;
    let I_ExchangeTransferManager;
    let I_ModuleRegistryProxy;
    let I_ModuleRegistry;
    let I_STRProxied;
    let I_MRProxied;
    let I_FeatureRegistry;
    let I_SecurityTokenRegistry;
    let I_STFactory;
    let I_SecurityToken;
    let I_PolyToken;
    let I_PolymathRegistry;

    // SecurityToken Details
    const name = "Team";
    const symbol = "sap";
    const tokenDetails = "This is equity type of issuance";
    const decimals = 18;
    const contact = "team@polymath.network";
    let snapId;
    // Module key
    const delegateManagerKey = 1;
    const transferManagerKey = 2;
    const stoKey = 3;
    const checkpointKey = 4;

    // Initial fee for ticker registry and security token registry
    const initRegFee = web3.utils.toWei("250");

    before(async() => {
        // Accounts setup
        account_polymath = accounts[0];
        account_issuer = accounts[1];

        token_owner = account_issuer;

        account_investor1 = accounts[6];
        account_investor2 = accounts[7];
        account_investor3 = accounts[8];
        account_investor4 = accounts[9];
        account_temp = accounts[2];

        // Step 1: Deploy the genral PM ecosystem
        let instances = await setUpPolymathNetwork(account_polymath, token_owner);

        [I_PolymathRegistry, I_PolyToken, I_FeatureRegistry, I_ModuleRegistry, I_ModuleRegistryProxy, I_MRProxied, I_GeneralTransferManagerFactory,
            I_STFactory, I_SecurityTokenRegistry, I_SecurityTokenRegistryProxy, I_STRProxied] = instances;

        // STEP 6: Deploy the ERC20DividendCheckpoint
        P_ERC20DividendCheckpointFactory = await ERC20DividendCheckpointFactory.new(I_PolyToken.address, web3.utils.toWei("500","ether"), 0, 0, {from:account_polymath});
        assert.notEqual(
            P_ERC20DividendCheckpointFactory.address.valueOf(),
            "0x0000000000000000000000000000000000000000",
            "ERC20DividendCheckpointFactory contract was not deployed"
        );

        // STEP 7: Deploy the ERC20DividendCheckpoint
        I_ERC20DividendCheckpointFactory = await ERC20DividendCheckpointFactory.new(I_PolyToken.address, 0, 0, 0, {from:account_polymath});
        assert.notEqual(
            I_ERC20DividendCheckpointFactory.address.valueOf(),
            "0x0000000000000000000000000000000000000000",
            "ERC20DividendCheckpointFactory contract was not deployed"
        );

       // STEP 8: Register the Modules with the ModuleRegistry contract

       // (A) : Register the ERC20DividendCheckpointFactory
       await I_MRProxied.registerModule(I_ERC20DividendCheckpointFactory.address, { from: account_polymath });
       await I_MRProxied.verifyModule(I_ERC20DividendCheckpointFactory.address, true, { from: account_polymath });

       // (B) : Register the Paid ERC20DividendCheckpointFactory
       await I_MRProxied.registerModule(P_ERC20DividendCheckpointFactory.address, { from: account_polymath });
       await I_MRProxied.verifyModule(P_ERC20DividendCheckpointFactory.address, true, { from: account_polymath });

        // Printing all the contract addresses
        console.log(`
        --------------------- Polymath Network Smart Contracts: ---------------------
        PolymathRegistry:                  ${I_PolymathRegistry.address}
        SecurityTokenRegistryProxy:        ${I_SecurityTokenRegistryProxy.address}
        SecurityTokenRegistry:             ${I_SecurityTokenRegistry.address}
        ModuleRegistry:                    ${I_ModuleRegistry.address}
        ModuleRegistryProxy:               ${I_ModuleRegistryProxy.address}
        FeatureRegistry:                   ${I_FeatureRegistry.address}

        STFactory:                         ${I_STFactory.address}
        GeneralTransferManagerFactory:     ${I_GeneralTransferManagerFactory.address}
        ERC20DividendCheckpointFactory:    ${I_ERC20DividendCheckpointFactory.address}
        -----------------------------------------------------------------------------
        `);
    });

    describe("Generate the SecurityToken", async() => {

        it("Should register the ticker before the generation of the security token", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let tx = await I_STRProxied.registerTicker(token_owner, symbol, contact, { from : token_owner });
            assert.equal(tx.logs[0].args._owner, token_owner);
            assert.equal(tx.logs[0].args._ticker, symbol.toUpperCase());
        });

        it("Should generate the new security token with the same symbol as registered above", async () => {
            await I_PolyToken.approve(I_STRProxied.address, initRegFee, { from: token_owner });
            let _blockNo = latestBlock();
            let tx = await I_STRProxied.generateSecurityToken(name, symbol, tokenDetails, false, { from: token_owner});

            // Verify the successful generation of the security token
            assert.equal(tx.logs[1].args._ticker, symbol.toUpperCase(), "SecurityToken doesn't get deployed");

            I_SecurityToken = SecurityToken.at(tx.logs[1].args._securityTokenAddress);

            const log = await promisifyLogWatch(I_SecurityToken.ModuleAdded({from: _blockNo}), 1);
            // Verify that GeneralTransferManager module get added successfully or not
            assert.equal(log.args._type.toNumber(), 2);
            assert.equal(
                web3.utils.toAscii(log.args._name)
                .replace(/\u0000/g, ''),
                "GeneralTransferManager"
            );
        });

        it("Should intialize the auto attached modules", async () => {
           let moduleData = await I_SecurityToken.modules(2, 0);
           I_GeneralTransferManager = GeneralTransferManager.at(moduleData);

        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token - fail insufficient payment", async () => {
            await catchRevert(
                I_SecurityToken.addModule(P_ERC20DividendCheckpointFactory.address, "", web3.utils.toWei("500", "ether"), 0, { from: token_owner }), 
                "tx -> failed because Token is not paid"
            );
        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token with budget", async () => {
            let snapId = await takeSnapshot()
            await I_PolyToken.getTokens(web3.utils.toWei("500", "ether"), token_owner);
            await I_PolyToken.transfer(I_SecurityToken.address, web3.utils.toWei("500", "ether"), {from: token_owner});
            const tx = await I_SecurityToken.addModule(P_ERC20DividendCheckpointFactory.address, "", web3.utils.toWei("500", "ether"), 0, { from: token_owner });
            assert.equal(tx.logs[3].args._type.toNumber(), checkpointKey, "ERC20DividendCheckpoint doesn't get deployed");
            assert.equal(
                web3.utils.toAscii(tx.logs[3].args._name)
                .replace(/\u0000/g, ''),
                "ERC20DividendCheckpoint",
                "ERC20DividendCheckpoint module was not added"
            );
            P_ERC20DividendCheckpoint = ERC20DividendCheckpoint.at(tx.logs[3].args._module);
            await revertToSnapshot(snapId);
        });

        it("Should successfully attach the ERC20DividendCheckpoint with the security token", async () => {
            const tx = await I_SecurityToken.addModule(I_ERC20DividendCheckpointFactory.address, "", 0, 0, { from: token_owner });
            assert.equal(tx.logs[2].args._type.toNumber(), checkpointKey, "ERC20DividendCheckpoint doesn't get deployed");
            assert.equal(
                web3.utils.toAscii(tx.logs[2].args._name)
                .replace(/\u0000/g, ''),
                "ERC20DividendCheckpoint",
                "ERC20DividendCheckpoint module was not added"
            );
            I_ERC20DividendCheckpoint = ERC20DividendCheckpoint.at(tx.logs[2].args._module);
        });
    });

    describe("Check Dividend payouts", async() => {

        it("Buy some tokens for account_investor1 (1 ETH)", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor1,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(30),
                true,
                {
                    from: account_issuer,
                    gas: 500000
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor1.toLowerCase(), "Failed in adding the investor in whitelist");

            // Jump time
            await increaseTime(5000);

            // Mint some tokens
            await I_SecurityToken.mint(account_investor1, web3.utils.toWei('1', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor1)).toNumber(),
                web3.utils.toWei('1', 'ether')
            );
        });

        it("Buy some tokens for account_investor2 (2 ETH)", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor2,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(30),
                true,
                {
                    from: account_issuer,
                    gas: 500000
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor2.toLowerCase(), "Failed in adding the investor in whitelist");

            // Mint some tokens
            await I_SecurityToken.mint(account_investor2, web3.utils.toWei('2', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor2)).toNumber(),
                web3.utils.toWei('2', 'ether')
            );
        });

        it("Should fail in creating the dividend - incorrect allowance", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(10);
            await I_PolyToken.getTokens(web3.utils.toWei('1.5', 'ether'), token_owner);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner}), 
                "tx -> failed because allowance = 0"
            );
        });

        it("Should fail in creating the dividend - maturity > expiry", async() => {
            let maturity = latestTime();
            let expiry = latestTime() - duration.days(10);
            await I_PolyToken.approve(I_ERC20DividendCheckpoint.address, web3.utils.toWei('1.5', 'ether'), {from: token_owner});
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner}), 
                "tx -> failed because maturity > expiry"
            );
        });

        it("Should fail in creating the dividend - now > expiry", async() => {
            let maturity = latestTime() - duration.days(2);
            let expiry = latestTime() - duration.days(1);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner}), 
                "tx -> failed because now > expiry"
            );
        });

        it("Should fail in creating the dividend - bad token", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(10);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, 0, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner}), 
                "tx -> failed because token address is 0x"
            );
        });

        it("Should fail in creating the dividend - amount is 0", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(10);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, 0, dividendName, {from: token_owner}), 
                "tx -> failed because amount < 0"
            );
        });

        it("Create new dividend of POLY tokens", async() => {
            let maturity = latestTime() + duration.days(1);
            let expiry = latestTime() + duration.days(10);

            let tx = await I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner});
            assert.equal(tx.logs[0].args._checkpointId.toNumber(), 1, "Dividend should be created at checkpoint 1");
            assert.equal(tx.logs[0].args._name.toString(), dividendName, "Dividend name incorrect in event");
        });

        it("Investor 1 transfers his token balance to investor 2", async() => {
            await I_SecurityToken.transfer(account_investor2, web3.utils.toWei('1', 'ether'), {from: account_investor1});
            assert.equal(await I_SecurityToken.balanceOf(account_investor1), 0);
            assert.equal(await I_SecurityToken.balanceOf(account_investor2), web3.utils.toWei('3', 'ether'));
        });

        it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails maturity in the future", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPayment(0, 0, 10, {from: token_owner}), 
                "tx -> failed because dividend index has maturity in future"
            );
        });

        it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails not owner", async() => {
            // Increase time by 2 day
            await increaseTime(duration.days(2));
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPayment(0, 0, 10, {from: account_temp}), 
                "tx -> failed because msg.sender is not the owner"
            );
        });

        it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails wrong index", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPayment(2, 0, 10, {from: token_owner}), 
                "tx -> failed because dividend index is greator than the dividend array length"
            );
        });

        it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint", async() => {
            let investor1Balance = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2Balance = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            await I_ERC20DividendCheckpoint.pushDividendPayment(0, 0, 10, {from: token_owner, gas: 5000000});
            let investor1BalanceAfter = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            assert.equal(investor1BalanceAfter.sub(investor1Balance).toNumber(), web3.utils.toWei('0.5', 'ether'));
            assert.equal(investor2BalanceAfter.sub(investor2Balance).toNumber(), web3.utils.toWei('1', 'ether'));
            //Check fully claimed
            assert.equal((await I_ERC20DividendCheckpoint.dividends(0))[5].toNumber(), web3.utils.toWei('1.5', 'ether'));
        });

        it("Buy some tokens for account_temp (1 ETH)", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_temp,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(20),
                true,
                {
                    from: account_issuer,
                    gas: 500000
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_temp.toLowerCase(), "Failed in adding the investor in whitelist");

            // Mint some tokens
            await I_SecurityToken.mint(account_temp, web3.utils.toWei('1', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_temp)).toNumber(),
                web3.utils.toWei('1', 'ether')
            );
        });

        it("Should not allow to create dividend without name", async() => {
            let maturity = latestTime() + duration.days(1);
            let expiry = latestTime() + duration.days(10);
            await I_PolyToken.getTokens(web3.utils.toWei('1.5', 'ether'), token_owner);
            await I_PolyToken.approve(I_ERC20DividendCheckpoint.address, web3.utils.toWei('1.5', 'ether'), {from: token_owner});
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), '', {from: token_owner}), 
                "tx -> failed because dividend name is empty"
            );
        });

        it("Create new dividend", async() => {
            let maturity = latestTime() + duration.days(1);
            let expiry = latestTime() + duration.days(10);
            await I_PolyToken.getTokens(web3.utils.toWei('1.5', 'ether'), token_owner);
            // transfer approved in above test
            let tx = await I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('1.5', 'ether'), dividendName, {from: token_owner});
            assert.equal(tx.logs[0].args._checkpointId.toNumber(), 2, "Dividend should be created at checkpoint 1");
        });

        it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoint - fails past expiry", async() => {
            await increaseTime(duration.days(12));
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPayment(1, 0, 10, {from: token_owner}), 
                "tx -> failed because dividend index has passed its expiry"
            );
        });

         it("Issuer pushes dividends iterating over account holders - dividends proportional to checkpoin - fails already reclaimed", async() => {
            let tx = await I_ERC20DividendCheckpoint.reclaimDividend(1, {from: token_owner, gas: 500000});
            assert.equal((tx.logs[0].args._claimedAmount).toNumber(), web3.utils.toWei("1.5", "ether"));
            await catchRevert(
                I_ERC20DividendCheckpoint.reclaimDividend(1, {from: token_owner, gas: 500000}), 
                "tx -> failed because dividend index has already been reclaimed"
            );
        });

        it("Buy some tokens for account_investor3 (7 ETH)", async() => {
            // Add the Investor in to the whitelist

            let tx = await I_GeneralTransferManager.modifyWhitelist(
                account_investor3,
                latestTime(),
                latestTime(),
                latestTime() + duration.days(10),
                true,
                {
                    from: account_issuer,
                    gas: 500000
                });

            assert.equal(tx.logs[0].args._investor.toLowerCase(), account_investor3.toLowerCase(), "Failed in adding the investor in whitelist");

            // Mint some tokens
            await I_SecurityToken.mint(account_investor3, web3.utils.toWei('7', 'ether'), { from: token_owner });

            assert.equal(
                (await I_SecurityToken.balanceOf(account_investor3)).toNumber(),
                web3.utils.toWei('7', 'ether')
            );
        });

        it("Exclude account_temp using global exclusion list", async() => {
            await I_ERC20DividendCheckpoint.setDefaultExcluded([account_temp], {from: token_owner});
            let excluded = await I_ERC20DividendCheckpoint.getDefaultExcluded();
            assert.equal(excluded[0], account_temp);
        });

        it("Create another new dividend", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(10);
            await I_PolyToken.getTokens(web3.utils.toWei('11', 'ether'), token_owner);
            await I_PolyToken.approve(I_ERC20DividendCheckpoint.address, web3.utils.toWei('11', 'ether'), {from: token_owner});
            let tx = await I_ERC20DividendCheckpoint.createDividend(maturity, expiry, I_PolyToken.address, web3.utils.toWei('10', 'ether'), dividendName, {from: token_owner});
            assert.equal(tx.logs[0].args._checkpointId.toNumber(), 3, "Dividend should be created at checkpoint 2");
        });

        it("should investor 3 claims dividend - fail bad index", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pullDividendPayment(5, {from: account_investor3, gasPrice: 0}), 
                "tx -> failed because dividend index is not valid"
            );
        });

        it("should investor 3 claims dividend", async() => {
            console.log((await I_ERC20DividendCheckpoint.dividends(2))[5].toNumber());
            let investor1Balance = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2Balance = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3Balance = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            await I_ERC20DividendCheckpoint.pullDividendPayment(2, {from: account_investor3, gasPrice: 0});
            let investor1BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            assert.equal(investor1BalanceAfter1.sub(investor1Balance).toNumber(), 0);
            assert.equal(investor2BalanceAfter1.sub(investor2Balance).toNumber(), 0);
            assert.equal(investor3BalanceAfter1.sub(investor3Balance).toNumber(), web3.utils.toWei('7', 'ether'));
        });

        it("should investor 3 claims dividend - fails already claimed", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pullDividendPayment(2, {from: account_investor3, gasPrice: 0}), 
                "tx -> failed because investor already claimed the dividend"
            );
        });

        it("should issuer pushes remain", async() => {
            console.log((await I_ERC20DividendCheckpoint.dividends(2))[5].toNumber());
            let investor1BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let investorTempBalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_temp));
            await I_ERC20DividendCheckpoint.pushDividendPayment(2, 0, 10, {from: token_owner});
            let investor1BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let investorTempBalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_temp));
            assert.equal(investor1BalanceAfter2.sub(investor1BalanceAfter1).toNumber(), 0);
            assert.equal(investor2BalanceAfter2.sub(investor2BalanceAfter1).toNumber(), web3.utils.toWei('3', 'ether'));
            assert.equal(investor3BalanceAfter2.sub(investor3BalanceAfter1).toNumber(), 0);
            assert.equal(investorTempBalanceAfter2.sub(investorTempBalanceAfter1).toNumber(), 0);
            //Check fully claimed
            assert.equal((await I_ERC20DividendCheckpoint.dividends(2))[5].toNumber(), web3.utils.toWei('10', 'ether'));
        });


        it("Delete global exclusion list", async() => {
            await I_ERC20DividendCheckpoint.setDefaultExcluded([], {from: token_owner});
        });


        it("Investor 2 transfers 1 ETH of his token balance to investor 1", async() => {
            await I_SecurityToken.transfer(account_investor1, web3.utils.toWei('1', 'ether'), {from: account_investor2});
            assert.equal(await I_SecurityToken.balanceOf(account_investor1), web3.utils.toWei('1', 'ether'));
            assert.equal(await I_SecurityToken.balanceOf(account_investor2), web3.utils.toWei('2', 'ether'));
            assert.equal(await I_SecurityToken.balanceOf(account_investor3), web3.utils.toWei('7', 'ether'));
            assert.equal(await I_SecurityToken.balanceOf(account_temp), web3.utils.toWei('1', 'ether'));
        });

        it("Create another new dividend with explicit checkpoint - fails bad allowance", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(2);
            let tx = await I_SecurityToken.createCheckpoint({from: token_owner});
            console.log(JSON.stringify(tx.logs[0].args));
            console.log((await I_SecurityToken.currentCheckpointId()).toNumber());
            await I_PolyToken.getTokens(web3.utils.toWei('20', 'ether'), token_owner);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividendWithCheckpoint(maturity, expiry, I_PolyToken.address, web3.utils.toWei('20', 'ether'), 4, dividendName, {from: token_owner}), 
                "tx -> failed because allowance is not provided"
            );
        });

        it("Create another new dividend with explicit - fails maturity > expiry", async() => {
            console.log((await I_SecurityToken.currentCheckpointId()).toNumber());

            let maturity = latestTime();
            let expiry = latestTime() - duration.days(10);
            await I_PolyToken.approve(I_ERC20DividendCheckpoint.address, web3.utils.toWei('20', 'ether'), {from: token_owner});
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividendWithCheckpoint(maturity, expiry, I_PolyToken.address, web3.utils.toWei('20', 'ether'), 4, dividendName, {from: token_owner}), 
                "tx -> failed because maturity > expiry"
            );
        });

        it("Create another new dividend with explicit - fails now > expiry", async() => {
            console.log((await I_SecurityToken.currentCheckpointId()).toNumber());

            let maturity = latestTime() - duration.days(5);
            let expiry = latestTime() - duration.days(2);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividendWithCheckpoint(maturity, expiry, I_PolyToken.address, web3.utils.toWei('20', 'ether'), 4, dividendName, {from: token_owner}), 
                "tx -> failed because now > expiry"
            );
        });

        it("Create another new dividend with explicit - fails bad checkpoint", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(2);
            await catchRevert(
                I_ERC20DividendCheckpoint.createDividendWithCheckpoint(maturity, expiry, I_PolyToken.address, web3.utils.toWei('20', 'ether'), 5, dividendName, {from: token_owner}), 
                "tx -> failed because checkpoint id > current checkpoint"
            );
        });

        it("Set withholding tax of 20% on account_temp and 10% on investor2", async() => {
            await I_ERC20DividendCheckpoint.setWithholding([account_temp, account_investor2], [BigNumber(20*10**16), BigNumber(10*10**16)], {from: token_owner});
        });

        it("Create another new dividend with explicit checkpoint and exclusion", async() => {
            let maturity = latestTime();
            let expiry = latestTime() + duration.days(10);
            await I_PolyToken.getTokens(web3.utils.toWei('11', 'ether'), token_owner);
            await I_PolyToken.approve(I_ERC20DividendCheckpoint.address, web3.utils.toWei('11', 'ether'), {from: token_owner});
            let tx = await I_ERC20DividendCheckpoint.createDividendWithCheckpointAndExclusions(maturity, expiry, I_PolyToken.address, web3.utils.toWei('10', 'ether'), 4, [account_investor1], dividendName, {from: token_owner});
            assert.equal(tx.logs[0].args._checkpointId.toNumber(), 4, "Dividend should be created at checkpoint 3");
        });

        it("Investor 2 claims dividend, issuer pushes investor 1 - fails not owner", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPaymentToAddresses(2, [account_investor2, account_investor1],{from: account_investor2, gasPrice: 0}), 
                "tx -> failed because not called by the owner"
            );
        });

        it("Investor 2 claims dividend, issuer pushes investor 1 - fails bad index", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pushDividendPaymentToAddresses(5, [account_investor2, account_investor1],{from: token_owner, gasPrice: 0}), 
                "tx -> failed because dividend index is not valid"
            );
        });

        it("should calculate dividend before the push dividend payment", async() => {
            let dividendAmount1 = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_investor1);
            let dividendAmount2 = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_investor2);
            let dividendAmount3 = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_investor3);
            let dividendAmount_temp = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_temp);
            assert.equal(dividendAmount1[0].toNumber(), web3.utils.toWei("0", "ether"));
            assert.equal(dividendAmount2[0].toNumber(), web3.utils.toWei("2", "ether"));
            assert.equal(dividendAmount3[0].toNumber(), web3.utils.toWei("7", "ether"));
            assert.equal(dividendAmount_temp[0].toNumber(), web3.utils.toWei("1", "ether"));
            assert.equal(dividendAmount1[1].toNumber(), web3.utils.toWei("0", "ether"));
            assert.equal(dividendAmount2[1].toNumber(), web3.utils.toWei("0.2", "ether"));
            assert.equal(dividendAmount3[1].toNumber(), web3.utils.toWei("0", "ether"));
            assert.equal(dividendAmount_temp[1].toNumber(), web3.utils.toWei("0.2", "ether"));
        });

        it("Investor 2 claims dividend", async() => {
            let investor1Balance = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2Balance = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3Balance = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let tempBalance = BigNumber(await web3.eth.getBalance(account_temp));
            await I_ERC20DividendCheckpoint.pullDividendPayment(3, {from: account_investor2, gasPrice: 0});
            let investor1BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let tempBalanceAfter1 = BigNumber(await web3.eth.getBalance(account_temp));
            assert.equal(investor1BalanceAfter1.sub(investor1Balance).toNumber(), 0);
            assert.equal(investor2BalanceAfter1.sub(investor2Balance).toNumber(), web3.utils.toWei('1.8', 'ether'));
            assert.equal(investor3BalanceAfter1.sub(investor3Balance).toNumber(), 0);
            assert.equal(tempBalanceAfter1.sub(tempBalance).toNumber(), 0);
        });

        it("Should issuer pushes temp investor - investor1 excluded", async() => {
            let investor1BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let tempBalanceAfter1 = BigNumber(await I_PolyToken.balanceOf(account_temp));
            await I_ERC20DividendCheckpoint.pushDividendPaymentToAddresses(3, [account_temp, account_investor1], {from: token_owner});
            let investor1BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor1));
            let investor2BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor2));
            let investor3BalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_investor3));
            let tempBalanceAfter2 = BigNumber(await I_PolyToken.balanceOf(account_temp));
            assert.equal(investor1BalanceAfter2.sub(investor1BalanceAfter1).toNumber(), 0);
            assert.equal(investor2BalanceAfter2.sub(investor2BalanceAfter1).toNumber(), 0);
            assert.equal(investor3BalanceAfter2.sub(investor3BalanceAfter1).toNumber(), 0);
            assert.equal(tempBalanceAfter2.sub(tempBalanceAfter1).toNumber(), web3.utils.toWei('0.8', 'ether'));
            //Check fully claimed
            assert.equal((await I_ERC20DividendCheckpoint.dividends(3))[5].toNumber(), web3.utils.toWei('3', 'ether'));
        });

        it("should calculate dividend after the push dividend payment", async() => {
            let dividendAmount1 = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_investor1);
            let dividendAmount2 = await I_ERC20DividendCheckpoint.calculateDividend.call(3, account_investor2);
            assert.equal(dividendAmount1[0].toNumber(), 0);
            assert.equal(dividendAmount2[0].toNumber(), 0);
        });

        it("Issuer reclaims withholding tax", async() => {
            let issuerBalance = BigNumber(await I_PolyToken.balanceOf(token_owner));
            await I_ERC20DividendCheckpoint.withdrawWithholding(3, {from: token_owner, gasPrice: 0});
            let issuerBalanceAfter = BigNumber(await I_PolyToken.balanceOf(token_owner));
            assert.equal(issuerBalanceAfter.sub(issuerBalance).toNumber(), web3.utils.toWei('0.4', 'ether'))
        });

         it("Issuer unable to reclaim dividend (expiry not passed)", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.reclaimDividend(3, {from: token_owner}), 
                "tx -> failed because expiry is in the future"
            );
        });

        it("Issuer is unable to reclaim invalid dividend", async() => {
            await increaseTime(11 * 24 * 60 * 60);
            await catchRevert(
                I_ERC20DividendCheckpoint.reclaimDividend(8, {from: token_owner, gasPrice: 0}), 
                "tx -> failed because dividend index is not valid"
            );
        });

        it("Investor 3 unable to pull dividend after expiry", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pullDividendPayment(3, {from: account_investor3, gasPrice: 0}), 
                "tx -> failed because expiry is in the past"
            );
        });

        it("Issuer is able to reclaim dividend after expiry", async() => {
            let tokenOwnerBalance = BigNumber(await I_PolyToken.balanceOf(token_owner));
            await I_ERC20DividendCheckpoint.reclaimDividend(3, {from: token_owner, gasPrice: 0});
            let tokenOwnerAfter = BigNumber(await I_PolyToken.balanceOf(token_owner));
            assert.equal(tokenOwnerAfter.sub(tokenOwnerBalance).toNumber(), web3.utils.toWei('7', 'ether'));
        });


        it("Issuer is unable to reclaim already reclaimed dividend", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.reclaimDividend(3, {from: token_owner, gasPrice: 0}), 
                "tx -> failed because dividend are already reclaimed"
            );
        });

        it("Investor 3 unable to pull dividend after reclaiming", async() => {
            await catchRevert(
                I_ERC20DividendCheckpoint.pullDividendPayment(3, {from: account_investor3, gasPrice: 0}), 
                "tx -> failed because expiry is in the past"
            );
        });

        it("Should give the right dividend index", async() => {
            let index = await I_ERC20DividendCheckpoint.getDividendIndex.call(3);
            assert.equal(index[0], 2);
        });

        it("Should give the right dividend index", async() => {
            let index = await I_ERC20DividendCheckpoint.getDividendIndex.call(8);
            assert.equal(index.length, 0);
        });

        it("Get the init data", async() => {
            let tx = await I_ERC20DividendCheckpoint.getInitFunction.call();
            assert.equal(web3.utils.toAscii(tx).replace(/\u0000/g, ''),0);
        });

        it("Should get the listed permissions", async() => {
            let tx = await I_ERC20DividendCheckpoint.getPermissions.call();
            assert.equal(tx.length,1);
        });

        describe("Test cases for the ERC20DividendCheckpointFactory", async() => {
            it("should get the exact details of the factory", async() => {
                assert.equal((await I_ERC20DividendCheckpointFactory.setupCost.call()).toNumber(), 0);
                assert.equal(await I_ERC20DividendCheckpointFactory.getType.call(), 4);
                assert.equal(web3.utils.toAscii(await I_ERC20DividendCheckpointFactory.getName.call())
                            .replace(/\u0000/g, ''),
                            "ERC20DividendCheckpoint",
                            "Wrong Module added");
                assert.equal(await I_ERC20DividendCheckpointFactory.getDescription.call(),
                            "Create ERC20 dividends for token holders at a specific checkpoint",
                            "Wrong Module added");
                assert.equal(await I_ERC20DividendCheckpointFactory.getTitle.call(),
                            "ERC20 Dividend Checkpoint",
                            "Wrong Module added");
                assert.equal(await I_ERC20DividendCheckpointFactory.getInstructions.call(),
                            "Create a ERC20 dividend which will be paid out to token holders proportional to their balances at the point the dividend is created",
                            "Wrong Module added");
                let tags = await I_ERC20DividendCheckpointFactory.getTags.call();
                assert.equal(tags.length, 3);

            });
        });

    });

});
