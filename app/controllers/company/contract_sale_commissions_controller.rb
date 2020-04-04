class Company::ContractSaleCommissionsController < Company::BaseController
  before_action :find_buy_contract
  
  def new
    @commission = @buy_contract.contract_sale_commisions.build
    @commission.csc_accounts.build
    respond_to do |format|
      format.html {}
      format.js {}
    end
  end
  
  def create
    @commission = @buy_contract.contract_sale_commisions.build(commission_params)
    if @commission.save
      @commissions = @buy_contract.contract_sale_commisions
      respond_to do |format|
        format.html {}
        format.js {flash.now[:success] = "Commission created successfully"}
      end
    else
      respond_to do |format|
        format.html {}
        format.js {flash.now[:errors] = @commission.errors.full_messages}
      end
    end
  end
  
  private
    
    def commission_params
      params.require(:contract_sale_commision).permit(:name, :rate, :frequency, :limit, csc_accounts_attributes: [:id, :accountable_type, :accountable_id, :_destroy])
    end
    
    def find_buy_contract
      @buy_contract = current_company.buy_contracts.find_by(id: params[:buy_contract_id])
    end

end