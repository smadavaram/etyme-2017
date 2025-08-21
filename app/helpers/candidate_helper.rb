# frozen_string_literal: true

module CandidateHelper
  include DateCalculation

  def get_next_date(last_date, time_sheet_frequency, date_1, date_2, end_of_month, day_of_week, end_date)
    if end_date < last_date
      last_date
    else
      if %w[immediately daily].include?(time_sheet_frequency)
        time_sheet_date = last_date + 1.days
      elsif time_sheet_frequency == 'weekly'
        time_sheet_date = date_of_next(day_of_week, last_date)
      elsif time_sheet_frequency == 'biweekly'
        time_sheet_date = date_of_next(day_of_week, date_of_next(day_of_week, last_date))
      elsif  time_sheet_frequency == 'twice a month'
        time_sheet_date = date_1.day == last_date.day ? (end_of_month ? last_date.end_of_month : last_date.change(day: date_2.day)) : (last_date + 1.month).change(day: date_1.day)
      elsif  time_sheet_frequency == 'monthly'
        time_sheet_date = if end_of_month
                            last_date.end_of_month
                          else
                            last_date.change(day: date_1.day)
                          end
      end
      time_sheet_date
    end
  end
end
