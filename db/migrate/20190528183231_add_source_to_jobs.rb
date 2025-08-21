class AddSourceToJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :source, :string
  end
end
