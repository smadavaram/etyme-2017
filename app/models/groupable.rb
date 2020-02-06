# frozen_string_literal: true

class Groupable < ApplicationRecord
  belongs_to :groupable, polymorphic: true, optional: true
  belongs_to :group, optional: true

  validates_uniqueness_of :group_id, scope: %i[groupable_type groupable_id]
end
