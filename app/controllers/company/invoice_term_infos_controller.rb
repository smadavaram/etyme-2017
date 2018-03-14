class Company::InvoiceTermInfosController < Company::BaseController
  before_action :set_department , only: [:create]
  respond_to :html,:json

  def index
    @invoice = current_company.invoice_infos
  end

  def create
    @invoice = current_company.invoice_infos.create!(invoice_params)
    redirect_back fallback_location: root_path
  end

  private

  def set_department
    @invoice=current_company.invoice_infos.new(invoice_params)
  end

  def invoice_params
    params.require(:invoice_info).permit(:id, :invoice_term )
  end

end