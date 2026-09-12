# frozen_string_literal: true

# == Schema Information
#
# Table name: groupables
#
#  id             :integer          not null, primary key
#  group_id       :integer
#  groupable_type :string
#  groupable_id   :integer
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#
class Groupable < ApplicationRecord
  belongs_to :groupable, polymorphic: true, optional: true
  belongs_to :group, optional: true

  validates_uniqueness_of :group_id, scope: %i[groupable_type groupable_id]
end
