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

  def generate_payroll_dates
    @payroll = current_company.payroll_infos.first
    @dates = Hash.new
    if @payroll.payroll_type == 'monthly'
      month_cycle
    elsif @payroll.payroll_type == 'weekly'
      week_cycle
    elsif @payroll.payroll_type == 'biweekly'
      biweek_cycle
    elsif @payroll.payroll_type == 'twice a month'
      twice_month
    end
  end

  def month_cycle
    12.times do |i|
      @dates[i+1] = {'end_date': Date.new(Date.today.year, i+1, @payroll.term_no.to_i )}
    end
    @dates.each do |x,y|
      @dates[x][:start_date] = @dates[x][:end_date]- 1.month+1
      @dates[x][:doc_date] = Date.new((@dates[x][:end_date]+@payroll.payroll_term.to_i.months).year,(@dates[x][:end_date]+@payroll.payroll_term.to_i.months).month, @payroll.sclr_date_1.day)
    end
  end

  def week_cycle
    sd = Date.today.beginning_of_year
    ed = sd.end_of_year
    doc_dates = []
    sd.upto(ed) do |date| 
      day_of_week = DateTime.parse(@payroll.sclr_day_of_week).wday
      doc_dates <<  date + ((day_of_week - date.wday) % 7 )
    end
    doc_dates.uniq.each_with_index do |x,i|
      @dates[i+1] = {'doc_date': x}
      @dates[i+1][:end_date] =  x - @payroll&.payroll_term.to_i
      @dates[i+1][:start_date] = @dates[i+1][:end_date] - (@payroll.payroll_type == 'weekly' ? 6.days : 13.days)
    end
  end

  def biweek_cycle
    sd = Date.today.beginning_of_year
    ed = sd.end_of_year
    doc_dates = []
    
    day_of_week = DateTime.parse(@payroll.sclr_day_of_week).wday
    doc_dates << sd + ((day_of_week - sd.wday) % 14 )

    (ed - sd).to_i.times do |i|
      doc_dates << doc_dates[i] + 14
      break if doc_dates[i] > ed
    end
    doc_dates.uniq.each_with_index do |x,i|
      @dates[i+1] = {'doc_date': x}
      @dates[i+1][:end_date] =  x - @payroll&.payroll_term.to_i
      @dates[i+1][:start_date] = @dates[i+1][:end_date] - (@payroll.payroll_type == 'weekly' ? 6.days : 13.days)      
    end
  end

  def twice_month
    12.times do |i|
      @dates[2*i] = {'doc_date': Date.new(Date.today.year, i+1, @payroll&.sclr_date_1.day )}

      @dates[2*i][:end_date] =  Date.new((@dates[2*i][:doc_date]- @payroll.payroll_term.to_i.months).year, (@dates[2*i][:doc_date]- @payroll.payroll_term.to_i.months).month, @payroll.term_no.to_i)
      #start date 1
      @dates[2*i][:start_date] = Date.new( (@dates[2*i][:end_date] -  @payroll.payroll_term.to_i.months).year, ((@dates[2*i][:end_date]- @payroll.payroll_term.to_i.months).month), @payroll.term_no_2.to_i+1  ) 


      @dates[2*i+1] = {'doc_date': Date.new(Date.today.year, i+1, @payroll&.sclr_date_2.day )}

      @dates[2*i+1][:end_date] =  Date.new( (@dates[2*i+1][:doc_date]- @payroll.payroll_term_2.to_i.months).year, (@dates[2*i+1][:doc_date]- @payroll.payroll_term_2.to_i.months).month, @payroll.term_no_2.to_i)
      #start date 2
      @dates[2*i+1][:start_date] = Date.new( (@dates[2*i+1][:end_date] -  @payroll.payroll_term_2.to_i.months).year, (@dates[2*i+1][:end_date].month), @payroll.term_no.to_i+1  ) 
    end

  end

  private

  def set_department
    # @payroll=current_company.payroll_infos.new(payroll_params.merge!(company_id: current_company.id))
  end

  def payroll_params
    params.require(:payroll_info).permit(:id, :payroll_term, :term_no, :term_no_2, :payroll_term_2, :payroll_type,:sal_cal_date, :payroll_date,
      :weekend_sch,
      :scal_day_time, :scal_date_1, :scal_date_2, :scal_day_of_week, :scal_end_of_month,
      :sp_day_time, :sp_date_1, :sp_date_2, :sp_day_of_week, :sp_end_of_month,
               
      :sclr_day_time, :sclr_date_1, :sclr_date_2, :sclr_day_of_week, :sclr_end_of_month,
                                         tax_infos_attributes: [:id,:tax_term, :_destroy])
  end
end