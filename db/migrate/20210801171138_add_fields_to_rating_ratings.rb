class AddFieldsToRatingRatings < ActiveRecord::Migration[5.2]
  def change
    add_column :rating_rates, :parent_id, :integer
    add_column :rating_rates, :description, :text
    # TODO: Create new column for project
    # add_column :rating_rates, :project_id, :integer

    add_index  :rating_rates, :parent_id
    # add_index  :rating_rates, :project_id
  end
end
