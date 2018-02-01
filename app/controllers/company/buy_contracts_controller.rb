class Company::BuyContractsController < Company::BaseController

  def index
    @buy_contracts = BuyContract.all
  end

  def show
    @buy_contract = BuyContract.where(number: params[:id]).first
  end

end
