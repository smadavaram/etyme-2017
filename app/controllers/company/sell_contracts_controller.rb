class Company::SellContractsController < Company::BaseController

  def index
    @sell_contracts = SellContract.joins(:contract).where(contracts: {company_id: current_company.id})
  end

  def show
    @sell_contract = SellContract.where(number: params[:id]).first
  end

end
