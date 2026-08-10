# frozen_string_literal: true

# == Schema Information
#
# Table name: visas
#
#  id           :bigint           not null, primary key
#  candidate_id :integer
#  title        :string
#  file         :string
#  exp_date     :date
#  status       :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  visa_number  :string
#  start_date   :date
#
class Visa < ApplicationRecord
end
