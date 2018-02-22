class Company::BuyContractsController < Company::BaseController

  def index
    @buy_contracts = BuyContract.joins(:contract).where(contracts: {company_id: current_company.id})
  end

  def show
    @buy_contract = BuyContract.where(number: params[:id]).first
  end

end
