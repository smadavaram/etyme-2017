# frozen_string_literal: true

# == Schema Information
#
# Table name: favourite_chats
#
#  id               :bigint           not null, primary key
#  favourable_type  :string
#  favourable_id    :bigint
#  favourabled_type :string
#  favourabled_id   :bigint
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#
class FavouriteChat < ApplicationRecord
  belongs_to :favourable, polymorphic: true
  belongs_to :favourabled, polymorphic: true

  validates_uniqueness_of :favourable_id, scope: %i[favourable_type favourabled_id favourabled_type]
end
