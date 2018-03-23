module DateCalculation

  def date_of_next(day, current_date)
    s = current_date.wday
    n = Date.parse(day).wday
    if s < n
      i =  n - s
    elsif s> n
      i =  n + (7-s)
    else
      i =  7
    end
    current_date + i.days
  end

end
