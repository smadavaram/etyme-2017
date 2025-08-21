# frozen_string_literal: true

# == Schema Information
#
# Table name: criminal_checks
#
#  id           :bigint           not null, primary key
#  candidate_id :integer
#  state        :string
#  address      :string
#  start_date   :date
#  end_date     :date
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class CriminalCheck < ApplicationRecord
end
