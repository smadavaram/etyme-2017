class Company::PayrollTermInfosController < Company::BaseController
  before_action :set_department , only: [:create]
  respond_to :html,:json

  def index
    @payroll = PayrollInfo.new
    @payroll.tax_infos.build unless @payroll.tax_infos.present?

    @payroll_detail = current_company.payroll_infos.last

  end

  def create
    params[:payroll_info][:sal_cal_date] = Time.strptime(params[:payroll_info][:sal_cal_date], "%m/%d/%Y") if params[:payroll_info][:sal_cal_date].present?
    params[:payroll_info][:payroll_date] =  Time.strptime(params[:payroll_info][:payroll_date], "%m/%d/%Y") if params[:payroll_info][:payroll_date].present?
    if !current_company.payroll_infos.blank?
      @payroll_detail = current_company.payroll_infos.last
      @payroll_detail.update_attributes(:payroll_term=>params[:payroll_info][:payroll_term] , :payroll_type =>params[:payroll_info][:payroll_type], :weekend_sch =>params[:payroll_info][:weekend_sch], :sal_cal_date =>params[:payroll_info][:sal_cal_date], :payroll_date => params[:payroll_info][:payroll_date])

      if params[:payroll_info][:tax_infos_attributes] && !params[:payroll_info][:tax_infos_attributes].blank? 
        params[:payroll_info][:tax_infos_attributes].each do |key, val|
          @payroll_detail.tax_infos.create(:tax_term=> val["tax_term"])
        end  
      end
    else

      @payroll = current_company.payroll_infos.create!(payroll_params.merge!(company_id: current_company.id))
    end  
    redirect_back fallback_location: root_path
  end

  private

  def set_department
    # @payroll=current_company.payroll_infos.new(payroll_params.merge!(company_id: current_company.id))
  end

  def payroll_params
    params.require(:payroll_info).permit(:id, :payroll_term, :payroll_type,:sal_cal_date, :payroll_date,:weekend_sch,
                                         tax_infos_attributes: [:id,:tax_term])
  end
end