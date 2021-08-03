class AddFieldsToRatingRatings < ActiveRecord::Migration[5.2]
  def change
    add_column :rating_rates, :parent_id, :integer
    add_column :rating_rates, :description, :text

    add_index  :rating_rates, :parent_id
  end
end
