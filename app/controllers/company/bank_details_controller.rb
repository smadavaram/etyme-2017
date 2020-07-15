# frozen_string_literal: true

class Company::BankDetailsController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path
  def bank_reconciliation
    add_breadcrumb 'bank reconciliation'

    @bank_detail = current_company.bank_details.new
  end

  def index
    add_breadcrumb 'Bank Details'
    @bank_details = current_company.bank_details.all
  end

  def create
    @bank_detail = current_company.bank_details.new(create_bank_detail_params)
    if @bank_detail.save
      current_company.etyme_transactions.create!(transaction_type: 'positive - bank deposit', amount: create_bank_detail_params[:balance], is_processed: true)
      flash[:success] = 'Treasury updated successfully'
      flash[:success] = 'Bank Detail has been Added successfully'
    else
      flash[:errors] = @bank_detail.errors.full_messages
    end
    respond_to do |format|
      format.js {}
    end
    @bank_details = current_company.bank_details.all
  end

  def update_acc_info
    @bank_detail = current_company.bank_details.find_by(bank_name: params[:bank_detail][:bank_name])
    params[:bank_detail][:balance] = params[:bank_detail][:new_balance] if params[:bank_detail][:new_balance].to_i > params[:bank_detail][:balance].to_i
    if @bank_detail
      params[:bank_detail][:unidentified_bal] = @bank_detail.unidentified_bal if params[:bank_detail][:unidentified_bal].to_i < 0
      @bank_detail.update_seq_bal(params[:bank_detail])
      params[:bank_detail][:balance].to_i = params[:bank_detail][:new_balance].to_i if params[:bank_detail][:new_balance].to_i > 0
      @bank_detail.update(bank_detail_params)
      redirect_to bank_reconciliation_bank_details_path
    else
      params[:bank_detail][:balance] = params[:bank_detail][:new_balance] if params[:bank_detail][:new_balance].to_i > params[:bank_detail][:balance].to_i
      @bank_detail = current_company.bank_details.new(bank_detail_params)
      @bank_detail.unidentified_bal = @bank_detail.unidentified_bal if params[:bank_detail][:unidentified_bal].to_i < 0
      @bank_detail.update_seq_bal(params[:bank_detail])
      params[:bank_detail][:balance], to_i = params[:bank_detail][:new_balance].to_i if params[:bank_detail][:new_balance].to_i > 0
      if @bank_detail.save
        redirect_to bank_reconciliation_bank_details_path
      else
        render 'new'
      end
    end
  end

  def acc_info
    acc_info = BankDetail.find_by(bank_name: params[:bank_name], company_id: current_company.id)
    render json: { acc_info: acc_info }
  end

  private

  def bank_detail_params
    params.require(:bank_detail).permit(:bank_name, :balance, :new_balance, :recon_date, :unidentified_bal, :current_unidentified_bal)
  end

  def create_bank_detail_params
    params.require(:bank_detail).permit(:bank_name, :balance)
  end
end
