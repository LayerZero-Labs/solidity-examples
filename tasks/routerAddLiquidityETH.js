

module.exports = async function (taskArgs, hre) {
    let signers = await ethers.getSigners()
    let owner = signers[0]

    let token = await ethers.getContractAt('MockToken', taskArgs.token)
    console.log(`token.address: ${token.address}`)
    let ammRouter = await ethers.getContractAt('IUniswapV2Router02', taskArgs.router)
    console.log(`ammRouter.address: ${ammRouter.address}`)

    await( await token.approve(ammRouter.address, ethers.utils.parseEther('10000000000')) ).wait()
    // set the config for this UA to use the specified Oracle

    let qty = ethers.utils.parseEther("200") // 200 tokens
    let deadline = parseInt(new Date().getTime() / 1000) + 1000
    let tx = await( await ammRouter.addLiquidityETH(
        token.address,
        qty,
        0,
        0,
        owner.address,
        deadline,
        {value: ethers.utils.parseEther('0.33')}
    )).wait()
    console.log(`tx: ${tx.transactionHash}`)
}
