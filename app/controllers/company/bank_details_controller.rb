class Company::BankDetailsController < Company::BaseController

  def bank_reconciliation
    @bank_detail = current_company.bank_details.new
  end

  def update_acc_info
    @bank_detail = BankDetail.find_by(bank_name: params[:bank_detail][:bank_name], company_id: current_company.id)
    params[:bank_detail][:balance] = params[:bank_detail][:new_balance]
    if @bank_detail
      # binding.pry
      if params[:bank_detail][:unidentified_bal].to_i < 0
        params[:bank_detail][:unidentified_bal] = @bank_detail.unidentified_bal
      end
      @bank_detail.update(bank_detail_params)
      @bank_detail.update_acc(params[:bank_detail])
      redirect_to bank_reconciliation_bank_details_path
    else
      params[:bank_detail][:balance] = params[:bank_detail][:new_balance]
      @bank_detail = current_company.bank_details.new(bank_detail_params)
      if params[:bank_detail][:unidentified_bal].to_i < 0
        @bank_detail.unidentified_bal = @bank_detail.unidentified_bal
      end
      if @bank_detail.save
        @bank_detail.update_acc(params[:bank_detail])
        redirect_to bank_reconciliation_bank_details_path
      else
        render 'new'
      end
    end
  end

  def acc_info
    # binding.pry
    acc_info = BankDetail.find_by(bank_name: params[:bank_name], company_id: current_company.id)
    render json: { acc_info: acc_info }
  end


  private

  def bank_detail_params
    params.require(:bank_detail).permit(:bank_name, :balance, :new_balance, :recon_date, :unidentified_bal, :current_unidentified_bal)
  end

end
