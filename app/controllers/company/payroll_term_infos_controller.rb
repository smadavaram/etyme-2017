class Company::PayrollTermInfosController < Company::BaseController
  add_breadcrumb "Dashboard", :dashboard_path
  add_breadcrumb "Payroll terms", :payroll_term_infos_path
  before_action :set_department, only: [:create]
  before_action :set_payroll, only: [:update, :edit, :generate_payroll_dates, :get_cycles]
  respond_to :html, :json

  def index
    @payrolls = current_company.payroll_infos
    @holidays = current_company.holidays
  end

  def new
    add_breadcrumb "New Payroll term", '#'
    @payroll = current_company.payroll_infos.build
    @payroll.payroll_type = 'daily'
  end

  def edit
    add_breadcrumb "Edit Payroll term", '#'
  end

  def update
    if @payroll.update(payroll_params)
      flash[:success] = 'Payroll has been updated'
      redirect_to payroll_term_infos_path
    else
      flash[:errors] = @payroll.errors.full_messages
      redirect_to edit_payroll_term_info(@payroll)
    end
  end

  def create
    @payroll = current_company.payroll_infos.build(payroll_params)
    if @payroll.save
      flash[:success] = 'Payroll has been created'
      redirect_to payroll_term_infos_path
    else
      flash[:errors] = @payroll.errors.full_messages
      redirect_back fallback_location: root_path
    end
  end

  def get_date_groups(buy_or_sell, resource_initial, cycle_frequency_field)
    sd = Date.today.beginning_of_year
    ed = Date.today.end_of_year
    utils = Cycle::Utils::DateUtils
    case buy_or_sell.send(cycle_frequency_field)
    when 'daily'
      utils.group_by_daily(sd, ed)
    when 'weekly'
      utils.group_by_weekly(buy_or_sell.send("#{resource_initial}_day_of_week"), sd, ed)
    when 'biweekly'
      utils.group_by_biweekly(buy_or_sell.send("#{resource_initial}_day_of_week"), buy_or_sell.send("#{resource_initial}_2day_of_week"), sd, ed)
    when 'monthly'
      utils.group_by_monthly(buy_or_sell.send("#{resource_initial}_date_1").try(:day), sd, ed)
    when 'twice a month'
      utils.group_by_twice_a_month(buy_or_sell.send("#{resource_initial}_date_1").try(:day), buy_or_sell.send("#{resource_initial}_date_2").try(:day), sd, ed)
    end
  end

  def generate_payroll_dates
    create_sp
    create_sc
    create_sclr
    redirect_to payroll_term_infos_path, success: 'Cycles Generated'
  end


  def get_cycles

  end

  def create_sp
    sp_date_groups = get_date_groups(@payroll, 'sp', 'payroll_type')
    sp_date_groups.each do |date|
      ContractCycle.create(
          cycle_type: 'SalaryProcess',
          start_date: date.first,
          end_date: date.last,
          post_date: holidat_shift(ContractCycle.get_post_date(get_selected_field('sp'), @payroll.payroll_type, date.first, date.last)),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: "Salary Process"
      )
    end
  end

  def create_sc
    sc_date_groups = get_date_groups(@payroll, 'sc', 'payroll_type')
    sc_date_groups.each do |date|
      ContractCycle.create(
          cycle_type: 'SalaryCalculation',
          start_date: date.first,
          end_date: date.last,
          post_date: holidat_shift(ContractCycle.get_post_date(get_selected_field('sc'), @payroll.payroll_type, date.first, date.last)),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: "Salary Calculation"
      )
    end
  end

  def create_sclr
    sclr_date_groups = get_date_groups(@payroll, 'sclr', 'payroll_type')
    sclr_date_groups.each do |date|
      ContractCycle.create(
          cycle_type: 'SalaryClear',
          start_date: date.first,
          end_date: date.last,
          post_date: holidat_shift(ContractCycle.get_post_date(get_selected_field('sclr'), @payroll.payroll_type, date.first, date.last)),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: "Salary Clear"
      )
    end
  end

  def get_selected_field(resource_initial)
    case @payroll.payroll_type
    when 'daily'
      Date.today.to_s
    when 'weekly'
      @payroll.send("#{resource_initial}_day_of_week")
    when 'biweekly'
      [@payroll.send("#{resource_initial}_day_of_week"), @payroll.send("#{resource_initial}_2day_of_week")]
    when 'monthly'
      @payroll.send("#{resource_initial}_date_1")
    when 'twice a month'
      [@payroll.send("#{resource_initial}_date_1"), @payroll.send("#{resource_initial}_date_2")]
    end
  end

  def holidat_shift(date)
    return nil if date.nil?
    date = (date - (@payroll.send("payroll_term_#{@payroll.payroll_type.split(' ').join('_')}")&.months || 0.months)) - (@payroll.send("term_no_#{@payroll.payroll_type.split(' ').join('_')}")&.days || 0.days)
    if date.sunday?
      @payroll.send("pay_period_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 2.days : date + 1.day
    elsif date.saturday?
      @payroll.send("pay_period_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 1.days : date + 2.day
    elsif current_company.holidays.where("Date(date) = '#{date.to_s}'").present?
      @payroll.send("pay_period_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 1.days : date + 1.day
    end
    date
  end


  def month_cycle
    12.times do |i|
      if i + 1 == 2 && (['30', '29'].include? @payroll.term_no)
        @dates[i + 1] = {'end_date': Date.new(Date.today.year, i + 1, Time.days_in_month(2, Date.today.year))}
      elsif @payroll.term_no == 'End of month'
        @dates[i + 1] = {'end_date': Date.new(Date.today.year, i + 1, Time.days_in_month(i + 1, Date.today.year))}
      else
        @dates[i + 1] = {'end_date': Date.new(Date.today.year, i + 1, @payroll.term_no.to_i)}
      end
    end

    @dates.each do |x, y|
      if x == 2 && (['30', '29'].include? @payroll.term_no)
        @dates[x][:start_date] = @dates[x - 1][:end_date] + 1
      elsif @payroll.term_no == 'End of month'
        @dates[x][:start_date] = @dates[x][:end_date].beginning_of_month
      else
        @dates[x][:start_date] = @dates[x][:end_date] - 1.month + 1
      end
      @dates[x][:doc_date] = Date.new((@dates[x][:end_date] + @payroll.payroll_term.to_i.months).year, (@dates[x][:end_date] + @payroll.payroll_term.to_i.months).month, @payroll.sclr_date_1.day)
      @dates[x][:cal_date] = @dates[x][:doc_date] - (@payroll.sclr_date_1.day - @payroll&.sc_date_1.day).to_i
      @dates[x][:pro_date] = @dates[x][:doc_date] - (@payroll.sclr_date_1.day - @payroll&.sp_date_1.day).to_i
    end
  end

  def week_cycle
    sd = Date.today.beginning_of_year
    ed = sd.end_of_year
    doc_dates = []
    sd.upto(ed) do |date|
      day_of_week = DateTime.parse(@payroll.sclr_day_of_week).wday
      doc_dates << date + ((day_of_week - date.wday) % 7)
    end
    doc_dates.uniq.each_with_index do |x, i|
      @dates[i + 1] = {'doc_date': x}
      @dates[i + 1][:end_date] = x - @payroll&.payroll_term.to_i
      @dates[i + 1][:start_date] = @dates[i + 1][:end_date] - (@payroll.payroll_type == 'weekly' ? 6.days : 13.days)
      @dates[i + 1][:cal_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sc_day_of_week).wday)
      @dates[i + 1][:pro_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sp_day_of_week).wday)
    end
  end

  def biweek_cycle
    sd = Date.today.beginning_of_year
    ed = sd.end_of_year
    doc_dates = []

    day_of_week = DateTime.parse(@payroll.sclr_day_of_week).wday
    doc_dates << sd + ((day_of_week - sd.wday) % 14)

    (ed - sd).to_i.times do |i|
      doc_dates << doc_dates[i] + 14
      break if doc_dates[i] > ed
    end
    doc_dates.uniq.each_with_index do |x, i|
      @dates[i + 1] = {'doc_date': x}
      @dates[i + 1][:end_date] = x - @payroll&.payroll_term.to_i
      @dates[i + 1][:start_date] = @dates[i + 1][:end_date] - (@payroll.payroll_type == 'weekly' ? 6.days : 13.days)
      @dates[i + 1][:cal_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sc_day_of_week).wday)
      @dates[i + 1][:pro_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sp_day_of_week).wday)

    end
  end

  def twice_month_cycle
    12.times do |i|
      @dates[2 * i] = {'doc_date': Date.new(Date.today.year, i + 1, @payroll&.sclr_date_1.day)}

      @dates[2 * i][:end_date] = Date.new((@dates[2 * i][:doc_date] - @payroll.payroll_term.to_i.months).year, (@dates[2 * i][:doc_date] - @payroll.payroll_term.to_i.months).month, @payroll.term_no.to_i)
      #start date 1
      @dates[2 * i][:start_date] = Date.new((@dates[2 * i][:end_date] - @payroll.payroll_term.to_i.months).year, ((@dates[2 * i][:end_date] - @payroll.payroll_term.to_i.months).month), @payroll.term_no_2.to_i + 1)

      @dates[2 * i][:cal_date] = @dates[2 * i][:doc_date] - ((@payroll&.sclr_date_1 - @payroll&.sc_date_1).to_i)
      @dates[2 * i][:pro_date] = @dates[2 * i][:doc_date] - ((@payroll&.sclr_date_1 - @payroll&.sp_date_1).to_i)


      @dates[2 * i + 1] = {'doc_date': Date.new(Date.today.year, i + 1, @payroll&.sclr_date_2.day)}

      if i + 1 == 2 && (['30', '29'].include? @payroll.term_no_2)
        @dates[2 * i + 1][:end_date] = Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Time.days_in_month(2, Date.today.year))
      elsif 'End of month' == @payroll&.term_no_2
        @dates[2 * i + 1][:end_date] = Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Time.days_in_month((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Date.today.year))
      else
        # binding.pry
        @dates[2 * i + 1][:end_date] = Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, @payroll&.term_no_2.to_i)

      end
      #start date 2
      @dates[2 * i + 1][:start_date] = Date.new((@dates[2 * i + 1][:end_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:end_date].month), @payroll.term_no.to_i + 1)

      @dates[2 * i + 1][:cal_date] = @dates[2 * i + 1][:doc_date] - ((@payroll&.sclr_date_2 - @payroll&.sc_date_2).to_i)
      @dates[2 * i + 1][:pro_date] = @dates[2 * i + 1][:doc_date] - ((@payroll&.sclr_date_2 - @payroll&.sp_date_2).to_i)
    end

  end

  def daily_cycle
    25.times do |i|
      @dates[i] = {'doc_date': Date.new(Date.today.year, Date.today.month, i + 1)}
      @dates[i][:end_date], @dates[i][:start_date] = @dates[i][:doc_date] - @payroll.payroll_term.to_i, @dates[i][:doc_date] - @payroll.payroll_term.to_i
      @dates[i][:cal_date], @dates[i][:pro_date] = @dates[i][:doc_date], @dates[i][:doc_date]
    end
  end

  private

  def set_payroll
    @payroll = current_company.payroll_infos.find_by(id: params[:id])
  end

  def set_department
    # @payroll=current_company.payroll_infos.new(payroll_params.merge!(company_id: current_company.id))
  end

  def payroll_params
    params.require(:payroll_info).permit(:id, :payroll_term, :term_no, :term_no_2, :payroll_term_2, :payroll_type, :sal_cal_date, :payroll_date, :title,
                                         :weekend_sch,
                                         :pay_period_weekly, :pay_period_biweekly, :pay_period_monthly, :pay_period_twice_a_month, :pay_period_daily,
                                         :payroll_term_weekly, :payroll_term_biweekly, :payroll_term_monthly, :payroll_term_twice_a_month, :payroll_term_daily,
                                         :term_no_weekly, :term_no_biweekly, :term_no_monthly, :term_no_twice_a_month, :term_no_daily,
                                         :weekend_sch_weekly, :weekend_sch_biweekly, :weekend_sch_monthly, :weekend_sch_twice_a_month, :weekend_sch_daily,
                                         :sc_day_time, :sc_date_1, :sc_date_2, :sc_day_of_week, :sc_end_of_month,
                                         :sp_day_time, :sp_date_1, :sp_date_2, :sp_day_of_week, :sp_end_of_month, :sc_2day_of_week, :sp_2day_of_week, :sclr_2day_of_week, :ven_bill_2day_of_week,
                                         :sclr_day_time, :sclr_date_1, :sclr_date_2, :sclr_day_of_week, :sclr_2day_of_week, :sclr_end_of_month, :ven_pay_2day_of_week, :ven_clr_2day_of_week,
                                         :ven_term_no_1, :ven_term_no_2, :ven_bill_date_1, :ven_bill_date_2, :ven_pay_date_1, :ven_pay_date_2, :ven_clr_date_1, :ven_clr_date_2, :ven_bill_day_time,
                                         :ven_pay_day_time, :ven_clr_day_time, :ven_bill_end_of_month, :ven_pay_end_of_month, :ven_clr_end_of_month, :ven_payroll_type, :ven_term_num_1, :ven_term_num_2, :ven_term_1, :ven_term_2,
                                         tax_infos_attributes: [:id, :tax_term, :_destroy])
  end
end