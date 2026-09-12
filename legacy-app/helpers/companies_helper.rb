# frozen_string_literal: true

module CompaniesHelper
  # Job Invitation set table row color
  def set_background_status_color(status)
    if status == 'accepted'
      'success'
    elsif status == 'rejected'
      'danger'
    elsif status == 'pending'
      'primary'
    end
  end

  def label_status_color(status)
    color = "<span class ='span label label-"
    if status == 'accepted'
      color += "success'>#{status.to_s.titleize}</span>"
    elsif status == 'rejected'
      color += "danger'>#{status.to_s.titleize}</span>"
    elsif status == 'pending'
      color += "info'>#{status.to_s.titleize}</span>"
    elsif status == 'is_ended'
      color += "default'>#{status.to_s.titleize}</span>"
    elsif status == 'cancelled'
      color += "danger'>#{status.to_s.titleize}</span>"
    elsif status == 'in_progress'
      color += "primary'>#{status.to_s.titleize}</span>"
    elsif status == 'paused'
      return 'warning'
    end
    raw(color)
  end

  def time_sheet_approve_date(buy_contract)
    ta_type = buy_contract&.ts_approve
    ta_day_of_week = if buy_contract&.ta_day_of_week.present?
                       Date.parse(buy_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
                     else
                       'mon'
                     end
    ta_date_1 = buy_contract&.ta_date_1.try(:strftime, '%e').to_i.ordinalize.to_s
    ta_date_2 = buy_contract&.ta_date_2.try(:strftime, '%e').to_i.ordinalize.to_s
    ta_end_of_month = buy_contract&.ta_end_of_month
    ta_day_time = buy_contract&.ta_day_time.try(:strftime, '%H:%M')

    message = case ta_type
              when 'daily'
                "Are you sure, your approval time is #{ta_day_time} ?"
              when 'weekly'
                "Are you sure, your approval day is #{ta_day_of_week} ?"
              when 'monthly'
                "Are you sure, your approval date is #{ta_date_1} #{'end of month' if ta_end_of_month} ?"
              when 'twice a month'
                "Are you sure, your approval dates are #{ta_date_1} and #{ta_date_2} #{'end of month' if ta_end_of_month} ?"
              else
                'Are you sure ?'
              end
  end

  def payroll_infos(company)
    company&.payroll_infos&.first&.present?
  end

  def handle_signup_domain
    params[:site] =='etyme' ? 'support': params[:site]
  end
end
