# frozen_string_literal: true

module Static::CandidatesHelper
  def availability(current_day, last_login_day)
    current_day - last_login_day
  end
  
end
