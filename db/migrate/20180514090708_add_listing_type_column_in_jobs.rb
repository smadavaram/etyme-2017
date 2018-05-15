class AddListingTypeColumnInJobs < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :listing_type, :string, default: "Job"
  end
end
