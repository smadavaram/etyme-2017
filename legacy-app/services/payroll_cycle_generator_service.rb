# frozen_string_literal: true

class PayrollCycleGeneratorService
  attr_reader :payroll, :company

  def initialize(payroll, company)
    @payroll = payroll
    @company = company
  end

  def generate
    if payroll.contract_cycles.present?
      payroll.contract_cycles.destroy_all
    end
    create_sp
    create_sc
    create_sclr
  end

  def get_date_groups(resource_initial, cycle_frequency_field)
    sd = Date.today.beginning_of_year
    ed = Date.today.end_of_year
    utils = Cycle::Utils::DateUtils
    case payroll.send(cycle_frequency_field)
    when 'daily'
      utils.group_by_daily(sd, ed)
    when 'weekly'
      utils.group_by_weekly(payroll.send("#{resource_initial}_day_of_week"), sd, ed)
    when 'biweekly'
      utils.group_by_biweekly(payroll.send("#{resource_initial}_day_of_week"), sd, ed)
    when 'monthly'
      utils.group_by_monthly(payroll.send("#{resource_initial}_date_1").try(:day), sd, ed)
    when 'twice a month'
      utils.group_by_twice_a_month(
        payroll.send("#{resource_initial}_date_1").try(:day),
        payroll.send("#{resource_initial}_date_2").try(:day),
        sd, ed
      )
    end
  end

  def filter_date_parameters(payroll_params)
    date_fields = %w[sclr_date_1 sc_date_1 sclr_date_2 sc_date_2 sp_date_2 sp_date_1 pay_period_twice_a_monthly]
    date_fields.each do |field|
      next unless payroll_params[field].present?

      begin
        date = Date.strptime(payroll_params[field], '%m-%d-%Y')
        payroll.update(field => date.strftime('%Y/%m/%d'))
      rescue StandardError
        payroll.update(field => payroll_params[field])
      end
    end
  end

  private

  def create_sp
    sp_date_groups = get_date_groups('sp', 'payroll_type')
    sp_date_groups.each do |date|
      ContractCycle.create(
        cycle_type: 'SalaryProcess',
        start_date: date.first,
        end_date: date.last,
        post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sp'), payroll.payroll_type, date.first, date.last) || date.first),
        cycle_of: payroll,
        cycle_frequency: payroll.payroll_type,
        note: 'Salary Process'
      )
    end
  end

  def create_sc
    sc_date_groups = get_date_groups('sc', 'payroll_type')
    sc_date_groups.each do |date|
      ContractCycle.create(
        cycle_type: 'SalaryCalculation',
        start_date: date.first,
        end_date: date.last,
        post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sc'), payroll.payroll_type, date.first, date.last) || date.first),
        cycle_of: payroll,
        cycle_frequency: payroll.payroll_type,
        note: 'Salary Calculation'
      )
    end
  end

  def create_sclr
    sclr_date_groups = get_date_groups('sclr', 'payroll_type')
    sclr_date_groups.each do |date|
      ContractCycle.create(
        cycle_type: 'SalaryClear',
        start_date: date.first,
        end_date: date.last,
        post_date: check_for_shift(ContractCycle.get_post_date(get_selected_field('sclr'), payroll.payroll_type, date.first, date.last) || date.first),
        cycle_of: payroll,
        cycle_frequency: payroll.payroll_type,
        note: 'Salary Clear'
      )
    end
  end

  def get_selected_field(resource_initial)
    case payroll.payroll_type
    when 'daily'
      Date.today.to_s
    when 'weekly'
      payroll.send("#{resource_initial}_day_of_week")
    when 'biweekly'
      [payroll.send("#{resource_initial}_day_of_week"), payroll.send("#{resource_initial}_2day_of_week")]
    when 'monthly'
      payroll.send("#{resource_initial}_date_1")
    when 'twice a month'
      [payroll.send("#{resource_initial}_date_1"), payroll.send("#{resource_initial}_date_2")]
    end
  end

  def check_for_shift(date)
    return nil if date.nil?

    date = shift_day(date) while date.sunday? || date.saturday? || company.holidays.where("Date(date) = '#{date}'").present?
    date
  end

  def shift_day(date)
    weekend_sch = payroll.send("weekend_sch_#{payroll.payroll_type.split(' ').join('_')}").present?
    if date.sunday?
      weekend_sch ? date - 2.days : date + 1.day
    elsif date.saturday?
      weekend_sch ? date - 1.days : date + 2.day
    elsif company.holidays.where("Date(date) = '#{date}'").present?
      weekend_sch ? date - 1.days : date + 1.day
    end
  end
end
