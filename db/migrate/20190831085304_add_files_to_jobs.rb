class AddFilesToJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :files, :text
  end
end
