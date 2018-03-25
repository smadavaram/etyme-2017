class Education < ActiveRecord::Base
  # validates :degree_title , presence: true
  # validates :start_year ,  presence: true
  # validates :completion_year , presence: true
  # validate  :completion_year_is_greater_than_start_year
  belongs_to :candidate , class_name:  "Candidate" ,foreign_key: 'user_id'

  private

  def completion_year_is_greater_than_start_year
    if self.completion_year.present?
      if self.completion_year < self.start_year
        errors.add(:completion_year," should be greater than start year")
        return false
      else
        return true
      end
    end
  end
end
