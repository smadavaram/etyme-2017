# frozen_string_literal: true

# == Schema Information
#
# Table name: holidays
#
#  id         :bigint           not null, primary key
#  date       :datetime
#  name       :string
#  company_id :bigint
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class Holiday < ApplicationRecord
  validates_date :date
  belongs_to :company
end
