# frozen_string_literal: true

module Cycle::Utils::DateUtils
  class << self
    DAY_TRANSLATION = { "sun": 'sunday?', "mon": 'monday?', "tue": 'tuesday?', "wed": 'wednesday?',
                        "thu": 'thursday?', "fri": 'friday?', "sat": 'saturday?' }.freeze

    def range(start_date, end_date)
      (start_date...end_date).to_a
    end

    def group_by_daily(start_date, end_date)
      range(start_date, end_date).map { |date| [date] }
    end

    def group_by_weekly(day, start_date, end_date)
      groups = []
      tmp = []
      range(start_date, end_date).each do |date|
        if date.send(DAY_TRANSLATION[day.to_sym])
          tmp << date
          groups << tmp
          tmp = []
        else
          tmp << date
        end
      end
      tmp.empty? ? groups : groups << tmp
    end

    def group_by_biweekly(day_one, day_two, start_date, end_date)
      groups = []
      tmp = []
      range(start_date, end_date).each do |date|
        if date.send(DAY_TRANSLATION[day_one.to_sym]) || date.send(DAY_TRANSLATION[day_two.to_sym])
          tmp << date
          groups << tmp
          tmp = []
        else
          tmp << date
        end
      end
      tmp.empty? ? groups : groups << tmp
    end

    def group_by_monthly(day, start_date, end_date)
      groups = []
      tmp = []
      range(start_date, end_date).each do |date|
        if date.day == day
          tmp << date
          groups << tmp
          tmp = []
        else
          tmp << date
        end
      end
      tmp.empty? ? groups : groups << tmp
    end

    def group_by_twice_a_month(day_one, day_two, start_date, end_date)
      groups = []
      tmp = []
      range(start_date, end_date).each do |date|
        if date.day == day_one || date.day == day_two
          tmp << date
          groups << tmp
          tmp = []
        else
          tmp << date
        end
      end
      tmp.empty? ? groups : groups << tmp
    end

    def get_date(value, frequency, start_date, end_date)
      case frequency
      when 'daily'
        start_date
      when 'twice a month'
        (start_date..end_date).to_a.find { |date| [value.first.day, value.second.day].include?(date.day) }
      when 'biweekly'
        (start_date..end_date).to_a.find { |date| date.send(DAY_TRANSLATION[value.first.to_sym]) || date.send(DAY_TRANSLATION[value.second.to_sym]) }
      when 'monthly'
        (start_date..end_date).to_a.find { |date| value.day == date.day }
      when 'weekly'
        (start_date..end_date).to_a.find { |date| date.send(DAY_TRANSLATION[value.to_sym]) }
      end
    end
  end
end
