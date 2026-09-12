# frozen_string_literal: true

# == Schema Information
#
# Table name: experiences
#
#  id               :integer          not null, primary key
#  experience_title :string
#  start_date       :date
#  end_date         :date
#  institute        :string
#  status           :integer
#  description      :text
#  user_id          :integer
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  industry         :string
#  department       :string
#
class Experience < ApplicationRecord
  validates :experience_title, presence: true
  validates :start_date, presence: true
  validates :end_date, presence: true
  validate  :end_date_is_greater_than_start_date

  belongs_to :candidate, class_name: 'Candidate', foreign_key: 'user_id', optional: true

  private

  def end_date_is_greater_than_start_date
    return unless end_date.present?

    if end_date < start_date
      errors.add(:end_date, ' should be greater than start date')
      false
    else
      true
    end
  end
end
