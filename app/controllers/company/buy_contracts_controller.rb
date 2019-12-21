class Company::BuyContractsController < Company::BaseController

  def index
    @buy_contracts = BuyContract.where(candidate_id: current_company.id)
  end

  def show
    @buy_contract = BuyContract.where(number: params[:id]).first
  end
  def payrolls
    @pr = current_company.payroll_infos.where("title like '%?%'",@params[:title])
    respond_to do |format|
      format.js{}
    end
  end
  def view_payroll

  end
  def edit_payroll
    @buy_contract =  BuyContract.find(params[:buy_contract_id])
    respond_to do |format|
      format.js{}
    end
  end

end
