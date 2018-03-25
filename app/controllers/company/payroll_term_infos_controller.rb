class Company::PayrollTermInfosController < Company::BaseController
  before_action :set_department , only: [:create]
  respond_to :html,:json

  def index
    @payroll = PayrollInfo.new
    @payroll.tax_infos.build unless @payroll.tax_infos.present?
  end

  def create
    params[:payroll_info][:sal_cal_date] = Time.strptime(params[:payroll_info][:sal_cal_date], "%m/%d/%Y") if params[:payroll_info][:sal_cal_date].present?
    params[:payroll_info][:payroll_date] =  Time.strptime(params[:payroll_info][:payroll_date], "%m/%d/%Y") if params[:payroll_info][:payroll_date].present?
    @payroll = current_company.payroll_infos.create!(payroll_params.merge!(company_id: current_company.id))
    redirect_back fallback_location: root_path
  end

  private

  def set_department
    @payroll=current_company.payroll_infos.new(payroll_params.merge!(company_id: current_company.id))
  end

  def payroll_params
    params.require(:payroll_info).permit(:id, :payroll_term, :payroll_type,:sal_cal_date, :payroll_date,:weekend_sch,
                                         tax_infos_attributes: [:id,:tax_term])
  end
end