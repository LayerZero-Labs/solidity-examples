const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployNew, deployNewFromAbi } = require("../utils/helpers");

const WETH = require('@uniswap/v2-periphery/build/WETH9');
const DEX_FACTORY = require('@uniswap/v2-core/build/UniswapV2Factory');
const DEX_ROUTER = require('@uniswap/v2-periphery/build/UniswapV2Router02');

describe("StargateComposed", function () {


    beforeEach(async function(){
        this.accounts = await hre.ethers.getSigners();
        this.owner = this.accounts[0]
        this.alice = this.accounts[1]
        this.bob = this.accounts[2]
        this.carol = this.accounts[3]

        this.token1 = await deployNew('MockToken', ['Token1', 'TOKEN_1'])
        this.token2 = await deployNew('MockToken', ['Token2', 'TOKEN_2'])

        // mock dex
        const weth = await deployNewFromAbi(WETH.abi, WETH.bytecode, this.owner)
        this.dexFactory = await deployNewFromAbi(DEX_FACTORY.abi, DEX_FACTORY.bytecode, this.owner, [this.owner.address])
        this.dexRouter = await deployNewFromAbi(DEX_ROUTER.abi, DEX_ROUTER.bytecode, this.owner, [this.dexFactory.address, weth.address])

        let approveQty = ethers.utils.parseEther("100000000000")
        await this.token1.approve(this.dexRouter.address, approveQty)
        await this.token2.approve(this.dexRouter.address, approveQty)
    })

    it("dexRouter addLiquidity", async function () {
        let qty = ethers.utils.parseEther("1")
        let now = (await ethers.provider.getBlock("latest")).timestamp
        await this.dexRouter.addLiquidityETH(
            this.token1.address,
            qty,
            0,
            0,
            this.owner.address,
            now + 10000,
            {value: qty}
        )
    });

})