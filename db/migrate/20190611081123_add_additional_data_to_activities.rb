class AddAdditionalDataToActivities < ActiveRecord::Migration[5.1]
  def change
    add_column :activities, :additional_data, :string
  end
end
