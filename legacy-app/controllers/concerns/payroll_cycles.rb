class PayrollCycles

  def initialize(payroll, company)
    @payroll = payroll
    @company = company
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
      utils.group_by_biweekly(buy_or_sell.send("#{resource_initial}_day_of_week"), sd, ed)
    when 'monthly'
      utils.group_by_monthly(buy_or_sell.send("#{resource_initial}_date_1").try(:day), sd, ed)
    when 'twice a month'
      utils.group_by_twice_a_month(buy_or_sell.send("#{resource_initial}_date_1").try(:day), buy_or_sell.send("#{resource_initial}_date_2").try(:day), sd, ed)
    end
  end

  def create_update_payroll
    if @payroll.contract_cycles.present?
      if @payroll.contract_cycles.destroy_all
        create_sp
        create_sc
        create_sclr
      end
    else
      create_sp
      create_sc
      create_sclr
    end
  end

  def get_cycles; end

  def create_sp
    sp_date_groups = get_date_groups(@payroll, 'sp', 'payroll_type')
    sp_date_groups.each do |date|
      ContractCycle.create(
          cycle_type: 'SalaryProcess',
          start_date: date.first,
          end_date: date.last,
          post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sp'), @payroll.payroll_type, date.first, date.last) || date.first),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: 'Salary Process'
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
          post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sc'), @payroll.payroll_type, date.first, date.last) || date.first),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: 'Salary Calculation'
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
          post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sclr'), @payroll.payroll_type, date.first, date.last) || date.first),
          cycle_of: @payroll,
          cycle_frequency: @payroll.payroll_type,
          note: 'Salary Clear'
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

  def check_for_shift(date)
    return nil if date.nil?

    date = shift_day(date) while date.sunday? || date.saturday? || @company.holidays.where("Date(date) = '#{date}'").present?
    date
  end

  def shift_day(date)
    if date.sunday?
      @payroll.send("weekend_sch_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 2.days : date + 1.day
    elsif date.saturday?
      @payroll.send("weekend_sch_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 1.days : date + 2.day
    elsif @company.holidays.where("Date(date) = '#{date}'").present?
      @payroll.send("weekend_sch_#{@payroll.payroll_type.split(' ').join('_')}").present? ? date - 1.days : date + 1.day
    end
  end

  def month_cycle
    12.times do |i|
      @dates[i + 1] = if i + 1 == 2 && (%w[30 29].include? @payroll.term_no)
                        { 'end_date': Date.new(Date.today.year, i + 1, Time.days_in_month(2, Date.today.year)) }
                      elsif @payroll.term_no == 'End of month'
                        { 'end_date': Date.new(Date.today.year, i + 1, Time.days_in_month(i + 1, Date.today.year)) }
                      else
                        { 'end_date': Date.new(Date.today.year, i + 1, @payroll.term_no.to_i) }
                      end
    end

    @dates.each do |x, _y|
      @dates[x][:start_date] = if x == 2 && (%w[30 29].include? @payroll.term_no)
                                 @dates[x - 1][:end_date] + 1
                               elsif @payroll.term_no == 'End of month'
                                 @dates[x][:end_date].beginning_of_month
                               else
                                 @dates[x][:end_date] - 1.month + 1
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
      @dates[i + 1] = { 'doc_date': x }
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
      @dates[i + 1] = { 'doc_date': x }
      @dates[i + 1][:end_date] = x - @payroll&.payroll_term.to_i
      @dates[i + 1][:start_date] = @dates[i + 1][:end_date] - (@payroll.payroll_type == 'weekly' ? 6.days : 13.days)
      @dates[i + 1][:cal_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sc_day_of_week).wday)
      @dates[i + 1][:pro_date] = @dates[i + 1][:doc_date] - (Date.parse(@payroll.sclr_day_of_week).wday - Date.parse(@payroll.sp_day_of_week).wday)
    end
  end

  def twice_month_cycle
    12.times do |i|
      @dates[2 * i] = { 'doc_date': Date.new(Date.today.year, i + 1, @payroll&.sclr_date_1.day) }

      @dates[2 * i][:end_date] = Date.new((@dates[2 * i][:doc_date] - @payroll.payroll_term.to_i.months).year, (@dates[2 * i][:doc_date] - @payroll.payroll_term.to_i.months).month, @payroll.term_no.to_i)
      # start date 1
      @dates[2 * i][:start_date] = Date.new((@dates[2 * i][:end_date] - @payroll.payroll_term.to_i.months).year, (@dates[2 * i][:end_date] - @payroll.payroll_term.to_i.months).month, @payroll.term_no_2.to_i + 1)

      @dates[2 * i][:cal_date] = @dates[2 * i][:doc_date] - (@payroll&.sclr_date_1 - @payroll&.sc_date_1).to_i
      @dates[2 * i][:pro_date] = @dates[2 * i][:doc_date] - (@payroll&.sclr_date_1 - @payroll&.sp_date_1).to_i

      @dates[2 * i + 1] = { 'doc_date': Date.new(Date.today.year, i + 1, @payroll&.sclr_date_2.day) }

      @dates[2 * i + 1][:end_date] = if i + 1 == 2 && (%w[30 29].include? @payroll.term_no_2)
                                       Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Time.days_in_month(2, Date.today.year))
                                     elsif @payroll&.term_no_2 == 'End of month'
                                       Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Time.days_in_month((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, Date.today.year))
                                     else
                                       # binding.pry
                                       Date.new((@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).year, (@dates[2 * i + 1][:doc_date] - @payroll.payroll_term_2.to_i.months).month, @payroll&.term_no_2.to_i)

                                     end
      # start date 2
      @dates[2 * i + 1][:start_date] = Date.new((@dates[2 * i + 1][:end_date] - @payroll.payroll_term_2.to_i.months).year, @dates[2 * i + 1][:end_date].month, @payroll.term_no.to_i + 1)

      @dates[2 * i + 1][:cal_date] = @dates[2 * i + 1][:doc_date] - (@payroll&.sclr_date_2 - @payroll&.sc_date_2).to_i
      @dates[2 * i + 1][:pro_date] = @dates[2 * i + 1][:doc_date] - (@payroll&.sclr_date_2 - @payroll&.sp_date_2).to_i
    end
  end

  def daily_cycle
    25.times do |i|
      @dates[i] = { 'doc_date': Date.new(Date.today.year, Date.today.month, i + 1) }
      @dates[i][:end_date] = @dates[i][:doc_date] - @payroll.payroll_term.to_i
      @dates[i][:start_date] = @dates[i][:doc_date] - @payroll.payroll_term.to_i
      @dates[i][:cal_date] = @dates[i][:doc_date]
      @dates[i][:pro_date] = @dates[i][:doc_date]
    end
  end

end
