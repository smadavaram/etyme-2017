class Company::SellContractsController < Company::BaseController

  def index
    @sell_contracts = SellContract.all
  end

  def show
    @sell_contract = SellContract.where(number: params[:id]).first
  end

end
