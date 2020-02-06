# frozen_string_literal: true

class FavouriteChat < ApplicationRecord
  belongs_to :favourable, polymorphic: true
  belongs_to :favourabled, polymorphic: true

  validates_uniqueness_of :favourable_id, scope: %i[favourable_type favourabled_id favourabled_type]
end
