class AddIndexedIntoJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs,:is_indexed, :boolean, default: false
  end
end
