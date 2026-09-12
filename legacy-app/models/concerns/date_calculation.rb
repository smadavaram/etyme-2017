# frozen_string_literal: true

module DateCalculation
  def date_of_next(day, current_date)
    s = current_date.wday
    n = Date.parse(day).wday
    i = if s < n
          n - s
        elsif s > n
          n + (7 - s)
        else
          7
        end
    current_date + i.days
  end
end
