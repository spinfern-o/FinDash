public class Expenses {

    int eMonthNum;
    double COGS;
    double packaging;
    double rent;
    double utilities;
    double maintenance;
    double hardware;
    double insurance;
    double marketing;
    double creditCardFees;
    double businessLicense;
    double telephone;
    double employeeMeals;
    double tax;
    double labor;

    double otherDirect;
    double otherOperating;
    double otherVariable;
    double otherFixed;

    /** Fifteen named columns, no leftovers. Kept so existing callers still work. */
    public Expenses(
        int eMonthNum,
        double COGS,
        double packaging,
        double rent,
        double utilities,
        double maintenance,
        double hardware,
        double insurance,
        double marketing,
        double creditCardFees,
        double businessLicense,
        double telephone,
        double employeeMeals,
        double tax,
        double labor
    ) {
        this.eMonthNum = eMonthNum;
        this.COGS = COGS;
        this.packaging = packaging;
        this.rent = rent;
        this.utilities = utilities;
        this.maintenance = maintenance;
        this.hardware = hardware;
        this.insurance = insurance;
        this.marketing = marketing;
        this.creditCardFees = creditCardFees;
        this.businessLicense = businessLicense;
        this.telephone = telephone;
        this.employeeMeals = employeeMeals;
        this.tax = tax;
        this.labor = labor;
    }

    /** Fifteen named columns plus whatever fell into the four catch-alls. */
    public Expenses(
        int eMonthNum,
        double COGS,
        double packaging,
        double rent,
        double utilities,
        double maintenance,
        double hardware,
        double insurance,
        double marketing,
        double creditCardFees,
        double businessLicense,
        double telephone,
        double employeeMeals,
        double tax,
        double labor,
        double otherDirect,
        double otherOperating,
        double otherVariable,
        double otherFixed
    ) {
        this(eMonthNum, COGS, packaging, rent, utilities, maintenance, hardware,
             insurance, marketing, creditCardFees, businessLicense, telephone,
             employeeMeals, tax, labor);
        this.otherDirect    = otherDirect;
        this.otherOperating = otherOperating;
        this.otherVariable  = otherVariable;
        this.otherFixed     = otherFixed;
    }

    public int eMonthNum() {
        return eMonthNum;
    }

    public double COGS() {
        return COGS;
    }

    public double packaging() {
        return packaging;
    }

    public double rent() {
        return rent;
    }

    public double utilities() {
        return utilities;
    }

    public double maintenance() {
        return maintenance;
    }

    public double hardware() {
        return hardware;
    }

    public double insurance() {
        return insurance;
    }

    public double marketing() {
        return marketing;
    }

    public double creditCardFees() {
        return creditCardFees;
    }

    public double businessLicense() {
        return businessLicense;
    }

    public double telephone() {
        return telephone;
    }

    public double employeeMeals() {
        return employeeMeals;
    }

    public double tax() {
        return tax;
    }

    public double labor() {
        return labor;
    }

    public double otherDirect() {
        return otherDirect;
    }

    public double otherOperating() {
        return otherOperating;
    }

    public double otherVariable() {
        return otherVariable;
    }

    public double otherFixed() {
        return otherFixed;
    }

    /** Anything that landed in a catch-all, across all four buckets. */
    public double otherTotal() {
        return otherDirect + otherOperating + otherVariable + otherFixed;
    }
}