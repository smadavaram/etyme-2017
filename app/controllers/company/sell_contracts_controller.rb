class Company::SellContractsController < Company::BaseController

  def index
    @sell_contracts = SellContract.includes(:company, contract: :job).where(contracts: {company_id: current_company.id})
  end

  def show
    @sell_contract = SellContract.where(number: params[:id]).first
  end

end
