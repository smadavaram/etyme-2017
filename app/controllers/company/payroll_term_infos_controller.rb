class Company::PayrollTermInfosController < Company::BaseController
  before_action :set_department , only: [:create]
  respond_to :html,:json

  def index

    @payroll_detail = current_company&.payroll_infos&.last
    unless @payroll_detail
      @payroll = PayrollInfo.new
    else
      @payroll = @payroll_detail
    end
    @payroll.tax_infos.build unless @payroll.tax_infos.present?

  end

  def create
    
      # @payroll_detail = current_company.payroll_infos.last
      # @payroll_detail.update_attributes(:payroll_term=>params[:payroll_info][:payroll_term] , :payroll_type =>params[:payroll_info][:payroll_type], :weekend_sch =>params[:payroll_info][:weekend_sch], :sal_cal_date =>params[:payroll_info][:sal_cal_date], :payroll_date => params[:payroll_info][:payroll_date])
      if current_company.payroll_infos.present?
        @payroll = current_company.payroll_infos.last
        @payroll.update(payroll_params)
      else
        current_company.payroll_infos.create(payroll_params)
      end
    #   if params[:payroll_info][:tax_infos_attributes] && !params[:payroll_info][:tax_infos_attributes].blank? 
    #     params[:payroll_info][:tax_infos_attributes].each do |key, val|
    #       @payroll_detail.tax_infos.create(:tax_term=> val["tax_term"])
    #     end  
    #   end
    # else

    #   @payroll = current_company.payroll_infos.create!(payroll_params.merge!(company_id: current_company.id))
    # end  
    redirect_back fallback_location: root_path
  end

  def update
    @payroll = current_company.payroll_infos.last
    @payroll.update(payroll_params)
    redirect_back fallback_location: root_path
  end

  private

  def set_department
    # @payroll=current_company.payroll_infos.new(payroll_params.merge!(company_id: current_company.id))
  end

  def payroll_params
    params.require(:payroll_info).permit(:id, :payroll_term, :term_no, :payroll_type,:sal_cal_date, :payroll_date,
      :weekend_sch,
      :scal_day_time, :scal_date_1, :scal_date_2, :scal_day_of_week, :scal_end_of_month,
      :sp_day_time, :sp_date_1, :sp_date_2, :sp_day_of_week, :sp_end_of_month,
               
      :sclr_day_time, :sclr_date_1, :sclr_date_2, :sclr_day_of_week, :sclr_end_of_month,
                                         tax_infos_attributes: [:id,:tax_term, :_destroy])
  end
end