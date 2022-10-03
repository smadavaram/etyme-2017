# frozen_string_literal: true

class Company::DomainSettingsController < Company::BaseController
  before_action :set_company, only: %i[index]
  add_breadcrumb 'Dashboard', :dashboard_path
  
  def index
    add_breadcrumb 'Domain Settings'
  end

  def set_company
    @company = Company.find(params[:id] || params[:company_id])
  end
  def bank_detail_params
    params.require(:bank_detail).permit(:bank_name, :balance, :new_balance, :recon_date, :unidentified_bal, :current_unidentified_bal)
  end

  def create_bank_detail_params
    params.require(:bank_detail).permit(:bank_name, :balance)
  end
end
